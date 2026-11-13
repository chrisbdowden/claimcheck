import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("h-8 w-8 shrink-0", className)}>
      <rect width="32" height="32" rx="7" className="fill-sidebar-accent" />
      <path
        d="M10 7h9l5 5v13a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"
        fill="none"
        className="stroke-sidebar-foreground/60"
        strokeWidth="1.6"
      />
      <path d="M19 7v5h5" fill="none" className="stroke-sidebar-foreground/60" strokeWidth="1.6" />
      <path
        d="M12.5 17.5l3 3 5.5-6"
        fill="none"
        className="stroke-sidebar-primary"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-tight group-data-[collapsible=icon]:hidden">
        <div className="text-[15px] font-semibold tracking-tight text-sidebar-accent-foreground">
          Claim<span className="text-sidebar-primary">Check</span>
        </div>
        <div className="text-[10.5px] uppercase tracking-[0.08em] text-sidebar-foreground/60">
          Expense Exception Detector
        </div>
      </div>
    </div>
  );
}
