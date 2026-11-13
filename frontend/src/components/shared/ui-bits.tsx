import type { ReactNode } from "react";
import { HelpCircle, FlaskConical } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card shadow-card", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Click/keyboard-accessible info tip (works without hover). */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`About ${label}`}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs leading-relaxed">{children}</PopoverContent>
    </Popover>
  );
}

export function SimLabel({ children = "Synthetic demo data" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-dashed border-teal/50 bg-accent px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-accent-foreground">
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Notice({
  children,
  tone = "info",
  icon,
}: {
  children: ReactNode;
  tone?: "info" | "warn";
  icon?: ReactNode;
}) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm",
        tone === "warn"
          ? "border-sev-medium/40 bg-sev-medium-soft text-foreground"
          : "border-teal/30 bg-accent text-accent-foreground",
      )}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tip,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tip?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          {tip && <InfoTip label={label}>{tip}</InfoTip>}
          {icon}
        </span>
      </div>
      <div className="num mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {body && <p className="max-w-sm text-xs text-muted-foreground">{body}</p>}
      {action}
    </div>
  );
}
