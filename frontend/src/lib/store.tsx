import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SYNTHETIC_LINES, EMPLOYEE_BY_ID } from "@/data/synthetic/dataset";
import { DEFAULT_POLICY } from "./policy-defaults";
import { runEngine, toFlagged } from "./demo-engine";
import { SEVERITY_RANK } from "./rules";
import type { ExpenseLine, FlaggedLine, HistoryEvent, Policy, ReviewStatus } from "./types";

export type DatePreset = "h1" | "q1" | "q2" | "jun";
export const DATE_PRESETS: Record<DatePreset, { label: string; from: string; to: string }> = {
  h1: { label: "Jan 1 – Jun 30, 2026", from: "2026-01-01", to: "2026-06-30" },
  q1: { label: "Q1 2026", from: "2026-01-01", to: "2026-03-31" },
  q2: { label: "Q2 2026", from: "2026-04-01", to: "2026-06-30" },
  jun: { label: "June 2026", from: "2026-06-01", to: "2026-06-30" },
};

export type Provider = "grok" | "claude" | "offline";
export interface Settings {
  orgName: string;
  density: "comfortable" | "compact";
  theme: "light" | "dark";
  defaultSeverity: "all" | "High";
  aiExplanations: boolean;
  aiMismatch: boolean;
  notifyHigh: boolean;
  notifyDigest: boolean;
}
const DEFAULT_SETTINGS: Settings = {
  orgName: "Northstar Finance Demo", density: "comfortable", theme: "light", defaultSeverity: "all",
  aiExplanations: true, aiMismatch: true, notifyHigh: true, notifyDigest: false,
};

export const CURRENT_USER = "Dana Whitfield (Demo Reviewer)";

/** Deterministic initial review state so the dashboard shows realistic progress. */
function seedStatus(id: string): ReviewStatus {
  const n = parseInt(id.slice(1), 10);
  const r = (n * 2654435761) % 100;
  if (r < 38) return "Cleared";
  if (r < 50) return "Escalated";
  if (r < 68) return "In Review";
  return "New";
}

function seedHistory(flagged: FlaggedLine[]): HistoryEvent[] {
  const users = ["Jamie Ortega", "Rina Patel", "Dana Whitfield"];
  const ev: HistoryEvent[] = [];
  flagged.forEach((f, i) => {
    const s = seedStatus(f.line.line_id);
    if (s === "New") return;
    const d = new Date(Date.parse(f.line.expense_date + "T00:00:00Z") + (3 + (i % 9)) * 86400000 + (9 + (i % 8)) * 3600000);
    const user = users[i % 3]!;
    ev.push({ id: `seed-${i}-a`, timestamp: d.toISOString(), user, type: "Status change", lineId: f.line.line_id, previousStatus: "New", newStatus: "In Review" });
    if (s !== "In Review") {
      const d2 = new Date(d.getTime() + (1 + (i % 4)) * 86400000);
      ev.push({ id: `seed-${i}-b`, timestamp: d2.toISOString(), user, type: "Status change", lineId: f.line.line_id, previousStatus: "In Review", newStatus: s,
        note: s === "Cleared" ? "Documentation reviewed; consistent with policy." : "Referred to controller for follow-up." });
    }
  });
  ev.push({ id: "seed-run", timestamp: "2026-07-01T08:00:00.000Z", user: "System (demo)", type: "Analysis run", note: "Bundled synthetic dataset analyzed with frontend demonstration ruleset." });
  return ev.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

interface Store {
  lines: ExpenseLine[];
  flagged: FlaggedLine[];
  flaggedById: Map<string, FlaggedLine>;
  lineById: Map<string, ExpenseLine>;
  policy: Policy;
  setPolicy: (p: Policy, summary: string) => void;
  resetPolicy: () => void;
  statusOf: (id: string) => ReviewStatus;
  setStatus: (id: string, s: ReviewStatus, note?: string) => void;
  notes: Record<string, { text: string; at: string; user: string }[]>;
  addNote: (id: string, text: string) => void;
  history: HistoryEvent[];
  logEvent: (e: Omit<HistoryEvent, "id" | "timestamp" | "user">) => void;
  datePreset: DatePreset;
  setDatePreset: (d: DatePreset) => void;
  inRange: (date: string) => boolean;
  provider: Provider;
  setProvider: (p: Provider) => void;
  settings: Settings;
  updateSettings: (s: Partial<Settings>) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  employeeName: (id: string) => string;
  resetDemo: () => void;
}

const Ctx = createContext<Store | null>(null);
const KEY = "claimcheck-demo-v1";

export function DemoProvider({ children }: { children: ReactNode }) {
  const [policy, setPolicyState] = useState<Policy>(DEFAULT_POLICY);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ReviewStatus>>({});
  const [notes, setNotes] = useState<Store["notes"]>({});
  const [userEvents, setUserEvents] = useState<HistoryEvent[]>([]);
  const [datePreset, setDatePreset] = useState<DatePreset>("h1");
  const [provider, setProvider] = useState<Provider>("offline");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.policy) setPolicyState(s.policy);
        if (s.statusOverrides) setStatusOverrides(s.statusOverrides);
        if (s.notes) setNotes(s.notes);
        if (s.userEvents) setUserEvents(s.userEvents);
        if (s.provider) setProvider(s.provider);
        if (s.settings) setSettings({ ...DEFAULT_SETTINGS, ...s.settings });
      }
    } catch { /* ignore corrupt demo state */ }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KEY, JSON.stringify({ policy, statusOverrides, notes, userEvents, provider, settings }));
  }, [hydrated, policy, statusOverrides, notes, userEvents, provider, settings]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
  }, [settings.theme]);

  const lines = SYNTHETIC_LINES;
  const lineById = useMemo(() => new Map(lines.map((l) => [l.line_id, l])), [lines]);
  const flagged = useMemo(() => {
    const f = toFlagged(lines, runEngine(lines, policy));
    return f.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.line.amount_usd - a.line.amount_usd);
  }, [lines, policy]);
  const flaggedById = useMemo(() => new Map(flagged.map((f) => [f.line.line_id, f])), [flagged]);
  const seeded = useMemo(() => seedHistory(toFlagged(lines, runEngine(lines, DEFAULT_POLICY))), [lines]);
  const history = useMemo(() => [...userEvents, ...seeded], [userEvents, seeded]);

  const logEvent = useCallback((e: Omit<HistoryEvent, "id" | "timestamp" | "user">) => {
    setUserEvents((prev) => [{ ...e, id: crypto.randomUUID(), timestamp: new Date().toISOString(), user: CURRENT_USER }, ...prev]);
  }, []);
  const statusOf = useCallback((id: string) => statusOverrides[id] ?? seedStatus(id), [statusOverrides]);
  const setStatus = useCallback((id: string, s: ReviewStatus, note?: string) => {
    const prev = statusOverrides[id] ?? seedStatus(id);
    if (prev === s) return;
    setStatusOverrides((o) => ({ ...o, [id]: s }));
    logEvent({ type: "Status change", lineId: id, previousStatus: prev, newStatus: s, note });
  }, [statusOverrides, logEvent]);
  const addNote = useCallback((id: string, text: string) => {
    setNotes((n) => ({ ...n, [id]: [...(n[id] ?? []), { text, at: new Date().toISOString(), user: CURRENT_USER }] }));
    logEvent({ type: "Note added", lineId: id, note: text });
  }, [logEvent]);
  const setPolicy = useCallback((p: Policy, summary: string) => { setPolicyState(p); logEvent({ type: "Policy change", note: summary }); }, [logEvent]);
  const resetPolicy = useCallback(() => { setPolicyState(DEFAULT_POLICY); logEvent({ type: "Policy change", note: "Policy reset to documented defaults." }); }, [logEvent]);
  const inRange = useCallback((d: string) => d >= DATE_PRESETS[datePreset].from && d <= DATE_PRESETS[datePreset].to, [datePreset]);
  const updateSettings = useCallback((s: Partial<Settings>) => setSettings((p) => ({ ...p, ...s })), []);
  const resetDemo = useCallback(() => {
    setPolicyState(DEFAULT_POLICY); setStatusOverrides({}); setNotes({}); setUserEvents([]); setProvider("offline"); setSettings(DEFAULT_SETTINGS);
  }, []);
  const employeeName = useCallback((id: string) => EMPLOYEE_BY_ID[id]?.name ?? id, []);

  const value: Store = {
    lines, flagged, flaggedById, lineById, policy, setPolicy, resetPolicy, statusOf, setStatus, notes, addNote,
    history, logEvent, datePreset, setDatePreset, inRange, provider, setProvider, settings, updateSettings,
    selectedId, setSelectedId, employeeName, resetDemo,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemo() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDemo must be used inside DemoProvider");
  return c;
}
