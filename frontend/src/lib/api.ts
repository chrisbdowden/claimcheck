/**
 * Typed client for the ClaimCheck API (the Python engine as a web service).
 * The API is the source of truth for detection, findings, AI review and
 * accuracy. No API keys, secrets or tokens live in this front end — the API
 * holds the AI key server-side.
 */
import type { ExpenseLine, FlaggedLine, Policy, RuleId, Severity } from "./types";

export const API_BASE = "https://claimcheck-api.vercel.app";

export interface ApiHealth {
  status: string;
  version: string;
  ai: { available: boolean; provider: string | null; model: string | null };
  limits: Record<string, number>;
  rules: { id: RuleId; label: string; severity: Severity }[];
}

export interface ApiFinding {
  rule: RuleId;
  severity: Severity;
  explanation: string;
  relatedLineIds: string[];
}

export interface ApiFlagged {
  line: ExpenseLine & { employee_name?: string; planted_issue?: string };
  findings: ApiFinding[];
  severity: Severity;
  reason: string;
}

export interface ApiRuleEval {
  rule: RuleId | "all";
  label: string;
  planted: number;
  detected: number;
  tp: number;
  fp: number;
  missed: number;
  precision: number | null;
  recall: number | null;
}

export interface ApiEvaluation {
  per_rule: ApiRuleEval[];
  rule_totals: ApiRuleEval;
  tx_totals: {
    lines: number;
    planted_lines: number;
    flagged: number;
    tp: number;
    fp: number;
    missed: number;
  };
}

export interface ApiAnalysis {
  mode: "offline" | "ai";
  ai: { requested: boolean; used: boolean; model: string | null; calls: number };
  notes: string[];
  summary: {
    lines_reviewed: number;
    lines_flagged: number;
    dollars_reviewed: number;
    dollars_flagged: number;
    high_severity: number;
    by_severity: Record<Severity, number>;
    flags_by_rule: Record<RuleId, number>;
    seconds: number;
  };
  flagged: ApiFlagged[];
  evaluation: ApiEvaluation | null;
  policy: Policy;
  limits: Record<string, number>;
  cached: boolean;
}

export interface ApiSample {
  lines: (ExpenseLine & { employee_name?: string; planted_issue?: string })[];
  policy: Policy;
}

export interface AnalyzeRequest {
  source: "bundled" | "upload";
  lines?: ExpenseLine[];
  policy?: Policy;
  use_ai?: boolean;
}

const TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`ClaimCheck API error ${status}: ${detail}`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body: unknown = await res.json();
        if (body && typeof body === "object" && "detail" in body) {
          const value = body.detail;
          if (typeof value === "string") detail = value;
          else if (Array.isArray(value)) {
            detail = value
              .map((item) => {
                if (item && typeof item === "object" && "msg" in item) {
                  const loc = "loc" in item && Array.isArray(item.loc) ? item.loc.join(" · ") : "";
                  return `${loc ? `${loc}: ` : ""}${String(item.msg)}`;
                }
                return JSON.stringify(item);
              })
              .join("; ");
          } else detail = JSON.stringify(value) ?? detail;
        }
      } catch {
        /* non-JSON error body; keep statusText */
      }
      throw new ApiError(res.status, detail);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function getHealth(): Promise<ApiHealth> {
  return request<ApiHealth>("/api/health");
}

export function getSample(): Promise<ApiSample> {
  return request<ApiSample>("/api/sample");
}

export function getPolicy(): Promise<Policy> {
  return request<Policy>("/api/policy");
}

export function analyze(body: AnalyzeRequest): Promise<ApiAnalysis> {
  return request<ApiAnalysis>("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Map an API flagged row to the existing FlaggedLine type, keeping `reason`. */
export function toFlaggedLine(f: ApiFlagged): FlaggedLine {
  return { line: f.line, findings: f.findings, severity: f.severity, reason: f.reason };
}
