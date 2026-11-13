import type { ExpenseLine, FlaggedLine, ReviewStatus, RuleId, Severity } from "./types";
import { RULES } from "./rules";

export function countBy<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return m;
}
export function sumBy<T>(items: T[], key: (t: T) => string, val: (t: T) => number) {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + val(i));
  return m;
}
export const severityData = (f: FlaggedLine[]) =>
  (["High", "Medium", "Low"] as Severity[]).map((s) => ({
    name: s,
    value: f.filter((x) => x.severity === s).length,
  }));
export const ruleData = (f: FlaggedLine[]) =>
  RULES.map((r) => ({
    id: r.id as RuleId,
    name: r.name,
    severity: r.severity,
    value: f.filter((x) => x.findings.some((y) => y.rule === r.id)).length,
  }));
export const categoryDollars = (f: FlaggedLine[]) =>
  [
    ...sumBy(
      f,
      (x) => x.line.category,
      (x) => x.line.amount_usd,
    ),
  ]
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
export const monthKey = (d: string) => d.slice(0, 7);
export const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
export const monthLabel = (m: string) =>
  new Date(m + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
export function weekly(lines: ExpenseLine[], flaggedIds: Set<string>) {
  const m = new Map<string, { week: string; spend: number; lines: number; flagged: number }>();
  for (const l of lines) {
    const d = new Date(l.expense_date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const k = d.toISOString().slice(0, 10);
    const e = m.get(k) ?? { week: k, spend: 0, lines: 0, flagged: 0 };
    e.spend += l.amount_usd;
    e.lines++;
    if (flaggedIds.has(l.line_id)) e.flagged++;
    m.set(k, e);
  }
  return [...m.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((e) => ({ ...e, spend: Math.round(e.spend) }));
}
export const REVIEWED: ReviewStatus[] = ["Cleared", "Escalated"];
