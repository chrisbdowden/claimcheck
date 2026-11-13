import { AlertOctagon, AlertTriangle, Info, CircleDot, Search, CheckCircle2, ArrowUpRight } from "lucide-react";
import type { ReviewStatus, RuleId, Severity } from "@/lib/types";
import { RULE_BY_ID } from "@/lib/rules";
import { cn } from "@/lib/utils";

const SEV = {
  High: { cls: "bg-sev-high-soft text-sev-high border-sev-high/30", Icon: AlertOctagon },
  Medium: { cls: "bg-sev-medium-soft text-[color-mix(in_oklab,var(--sev-medium)_70%,var(--foreground))] border-sev-medium/40", Icon: AlertTriangle },
  Low: { cls: "bg-sev-low-soft text-sev-low border-sev-low/30", Icon: Info },
} as const;

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const { cls, Icon } = SEV[severity];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", cls, className)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {severity}
    </span>
  );
}

const STATUS: Record<ReviewStatus, { cls: string; Icon: typeof CircleDot }> = {
  New: { cls: "bg-secondary text-foreground border-border", Icon: CircleDot },
  "In Review": { cls: "bg-sev-low-soft text-sev-low border-sev-low/30", Icon: Search },
  Cleared: { cls: "bg-success-soft text-success border-success/30", Icon: CheckCircle2 },
  Escalated: { cls: "bg-sev-high-soft text-sev-high border-sev-high/30", Icon: ArrowUpRight },
};

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const { cls, Icon } = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", cls)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {status}
    </span>
  );
}

export function RuleChip({ rule }: { rule: RuleId }) {
  const r = RULE_BY_ID[rule];
  const dot = r.severity === "High" ? "bg-sev-high" : r.severity === "Medium" ? "bg-sev-medium" : "bg-sev-low";
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-foreground whitespace-nowrap">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden="true" />
      {r.name}
    </span>
  );
}

export const SEVERITY_FILL: Record<Severity, string> = { High: "var(--sev-high)", Medium: "var(--sev-medium)", Low: "var(--sev-low)" };
export const STATUS_FILL: Record<ReviewStatus, string> = { New: "var(--muted-foreground)", "In Review": "var(--sev-low)", Cleared: "var(--success)", Escalated: "var(--sev-high)" };
