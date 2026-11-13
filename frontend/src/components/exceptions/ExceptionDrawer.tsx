import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileCheck2, FileX2, ShieldAlert, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SeverityBadge, StatusBadge, RuleChip } from "@/components/shared/badges";
import { useDemo } from "@/lib/store";
import { RULE_BY_ID, SEVERITY_RANK } from "@/lib/rules";
import { usd, fmtDate, fmtDateTime } from "@/lib/format";
import type { ReviewStatus } from "@/lib/types";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function ExceptionDetail({ id, compact = false }: { id: string; compact?: boolean }) {
  const { flaggedById, lineById, policy, employeeName } = useDemo();
  const f = flaggedById.get(id);
  const line = f?.line ?? lineById.get(id);
  if (!line) return null;
  const related = [...new Set(f?.findings.flatMap((x) => x.relatedLineIds) ?? [])].map((r) => lineById.get(r)!).filter(Boolean);
  const limit = policy.categoryLimits[line.category];
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Line ID"><span className="font-mono">{line.line_id}</span></Field>
        <Field label="Report ID"><span className="font-mono">{line.report_id}</span></Field>
        <Field label="Employee">{employeeName(line.employee_id)} <span className="text-muted-foreground">({line.employee_id})</span></Field>
        <Field label="Expense date">{fmtDate(line.expense_date)}</Field>
        <Field label="Merchant">{line.merchant}<div className="text-xs text-muted-foreground">{line.merchant_type}</div></Field>
        <Field label="Category">{line.category}</Field>
        <Field label="Amount"><span className="num text-base font-semibold">{usd(line.amount_usd)}</span></Field>
        <Field label="Receipt">
          {line.receipt_attached
            ? <span className="inline-flex items-center gap-1 text-success"><FileCheck2 className="h-4 w-4" aria-hidden="true" />Attached</span>
            : <span className="inline-flex items-center gap-1 text-sev-high"><FileX2 className="h-4 w-4" aria-hidden="true" />Not attached</span>}
        </Field>
        <div className="col-span-2"><Field label="Description">“{line.description}”</Field></div>
      </dl>

      {!compact && (
        <div className="rounded-md border border-border bg-secondary/50 p-3 text-xs">
          <div className="mb-1 font-semibold text-foreground">Policy context</div>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>{line.category} limit: <span className="num text-foreground">{limit != null ? usd(limit, 0) : "None configured"}</span></li>
            <li>Receipt required above: <span className="num text-foreground">{usd(policy.receiptThreshold, 0)}</span></li>
            <li>Weekend restricted: <span className="text-foreground">{policy.weekendRestrictedCategories.includes(line.category) ? "Yes" : "No"}</span> · Shared-expense category: <span className="text-foreground">{policy.sharedExpenseCategories.includes(line.category) ? "Yes" : "No"}</span></li>
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Rules triggered</h3>
        {!f ? <p className="text-sm text-muted-foreground">No rules triggered under the current policy.</p> : (
          <ul className="space-y-2">
            {f.findings.map((x, i) => (
              <li key={i} className="rounded-md border border-border p-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={x.severity} />
                  <span className="text-sm font-medium">{RULE_BY_ID[x.rule].name}</span>
                  {RULE_BY_ID[x.rule].kind !== "Deterministic" && <span className="text-[10.5px] text-muted-foreground">Offline heuristic</span>}
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{x.explanation}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {related.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Link2 className="h-4 w-4" aria-hidden="true" />Related transactions</h3>
          <ul className="divide-y divide-border rounded-md border border-border">
            {related.map((r) => (
              <li key={r.line_id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 text-xs">
                <span className="font-mono">{r.line_id}</span>
                <span className="truncate">{employeeName(r.employee_id)} · {r.merchant} · {fmtDate(r.expense_date)}</span>
                <span className="num font-medium">{usd(r.amount_usd)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Matching records indicate a pattern to check — not a conclusion. A reviewer must confirm.</p>
        </div>
      )}
    </div>
  );
}

export function ReviewActions({ id }: { id: string }) {
  const { statusOf, setStatus, addNote } = useDemo();
  const [note, setNote] = useState("");
  const act = (s: ReviewStatus, msg: string) => { setStatus(id, s); toast.success(msg, { description: `${id} → ${s} (local demo state)` }); };
  const status = statusOf(id);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={status === "In Review"} onClick={() => act("In Review", "Marked in review")}>Mark In Review</Button>
        <Button size="sm" className="bg-success text-primary-foreground hover:bg-success/90" disabled={status === "Cleared"} onClick={() => act("Cleared", "Exception cleared")}>Clear Exception</Button>
        <Button size="sm" variant="outline" className="border-sev-high/40 text-sev-high hover:bg-sev-high-soft" disabled={status === "Escalated"} onClick={() => act("Escalated", "Exception escalated")}>
          <ShieldAlert className="mr-1 h-3.5 w-3.5" />Escalate
        </Button>
      </div>
      <div>
        <label htmlFor={`note-${id}`} className="mb-1 block text-xs font-medium">Reviewer note</label>
        <Textarea id={`note-${id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Requested itemized receipt from employee." rows={3} />
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="secondary" disabled={!note.trim()} onClick={() => { addNote(id, note.trim()); setNote(""); toast.success("Note added"); }}>Add Note</Button>
        </div>
      </div>
    </div>
  );
}

export function ReviewHistory({ id }: { id: string }) {
  const { history } = useDemo();
  const ev = history.filter((h) => h.lineId === id);
  if (!ev.length) return <p className="text-xs text-muted-foreground">No review activity yet.</p>;
  return (
    <ol className="space-y-2.5 border-l border-border pl-3">
      {ev.map((e) => (
        <li key={e.id} className="relative text-xs">
          <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-teal" aria-hidden="true" />
          <div className="text-muted-foreground">{fmtDateTime(e.timestamp)} · {e.user}</div>
          <div className="text-foreground">
            {e.type === "Status change" ? <>Status {e.previousStatus} → <strong>{e.newStatus}</strong></> : e.type}
            {e.note && <span className="block text-muted-foreground">“{e.note}”</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ExceptionDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { flaggedById, statusOf, setSelectedId } = useDemo();
  const navigate = useNavigate();
  const f = id ? flaggedById.get(id) : undefined;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {id && (
          <>
            <SheetHeader className="mb-4 space-y-2 text-left">
              <div className="flex flex-wrap items-center gap-2">
                {f && <SeverityBadge severity={f.severity} />}
                <StatusBadge status={statusOf(id)} />
              </div>
              <SheetTitle className="text-lg">
                {f ? `${f.severity} Severity — ${RULE_BY_ID[f.findings.slice().sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0]!.rule].name}` : "Expense line"}
              </SheetTitle>
              <SheetDescription>
                {f && <span className="flex flex-wrap gap-1">{f.findings.map((x) => <RuleChip key={x.rule} rule={x.rule} />)}</span>}
              </SheetDescription>
            </SheetHeader>
            <ExceptionDetail id={id} />
            {f && (
              <>
                <hr className="my-5 border-border" />
                <h3 className="mb-2 text-sm font-semibold">Review actions</h3>
                <ReviewActions id={id} />
                <hr className="my-5 border-border" />
                <h3 className="mb-2 text-sm font-semibold">Review history & notes</h3>
                <ReviewHistory id={id} />
                <div className="mt-6 flex justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
                  <Button variant="outline" size="sm" onClick={() => { setSelectedId(id); navigate({ to: "/review" }); }}>Open in Review Workspace</Button>
                </div>
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
