import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Scale, ChevronLeft, ChevronRight, FileText, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Notice, Panel, EmptyState } from "@/components/shared/ui-bits";
import { SeverityBadge, StatusBadge, RuleChip } from "@/components/shared/badges";
import { ExceptionDetail, ReviewHistory } from "@/components/exceptions/ExceptionDrawer";
import { useDemo } from "@/lib/store";
import { RULE_BY_ID } from "@/lib/rules";
import { usd, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReviewStatus } from "@/lib/types";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review Workspace — ClaimCheck" },
      { name: "description", content: "Work through flagged expenses with evidence, explanations and a review decision panel." },
      { property: "og:title", content: "Review Workspace — ClaimCheck" },
      { property: "og:description", content: "A focused workspace for finance reviewers." },
    ],
  }),
  component: ReviewWorkspace,
});

type Scope = "open" | "escalated" | "all";

function ReviewWorkspace() {
  const { flagged, statusOf, setStatus, addNote, selectedId, setSelectedId, employeeName, inRange, lineById } = useDemo();
  const [scope, setScope] = useState<Scope>("open");
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const list = useMemo(() => flagged.filter((f) => {
    if (!inRange(f.line.expense_date)) return false;
    const s = statusOf(f.line.line_id);
    if (scope === "open" && !(s === "New" || s === "In Review")) return false;
    if (scope === "escalated" && s !== "Escalated") return false;
    const ql = q.toLowerCase();
    return !ql || f.line.line_id.toLowerCase().includes(ql) || f.line.merchant.toLowerCase().includes(ql) || employeeName(f.line.employee_id).toLowerCase().includes(ql);
  }), [flagged, statusOf, scope, q, inRange, employeeName]);

  useEffect(() => {
    if (!selectedId && list[0]) setSelectedId(list[0].line.line_id);
  }, [selectedId, list, setSelectedId]);

  const sel = selectedId ? flagged.find((f) => f.line.line_id === selectedId) : undefined;
  const idx = list.findIndex((f) => f.line.line_id === selectedId);
  const go = (d: number) => { const n = list[idx + d]; if (n) setSelectedId(n.line.line_id); };
  const status = sel ? statusOf(sel.line.line_id) : "New";

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review Workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">Select an exception, examine the evidence, and record a decision.</p>
        </div>
      </div>
      <div className="mb-4">
        <Notice icon={<Scale className="h-4 w-4" />}>
          <strong>ClaimCheck identifies items for review. Final decisions remain with authorized finance personnel.</strong>{" "}
          <span className="opacity-80">Statuses here are prototype-only and don't block payments, route approvals, or update any financial system.</span>
        </Notice>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        {/* Worklist */}
        <Panel title={`Worklist (${list.length})`} bodyClassName="p-0" className="lg:row-span-2 xl:row-span-1">
          <div className="space-y-2 border-b border-border p-3">
            <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="open" className="text-xs">Open</TabsTrigger>
                <TabsTrigger value="escalated" className="text-xs">Escalated</TabsTrigger>
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter worklist…" aria-label="Filter worklist" className="h-8 text-sm" />
          </div>
          {list.length === 0 ? <EmptyState title="Worklist is empty" body="No exceptions in this view. Switch tabs or change the date range." /> : (
            <ul className="max-h-[70vh] overflow-y-auto" aria-label="Exceptions to review">
              {list.map((f) => {
                const on = f.line.line_id === selectedId;
                return (
                  <li key={f.line.line_id}>
                    <button onClick={() => setSelectedId(f.line.line_id)} aria-current={on}
                      className={cn("w-full border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-secondary/50", on && "bg-accent shadow-[inset_3px_0_0_var(--teal)]")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{f.line.line_id}</span>
                        <SeverityBadge severity={f.severity} />
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{f.line.merchant}</span>
                        <span className="num font-medium">{usd(f.line.amount_usd)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="truncate">{employeeName(f.line.employee_id)} · {fmtDate(f.line.expense_date)}</span>
                        <span>{statusOf(f.line.line_id)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Evidence */}
        <Panel title={sel ? <span className="flex items-center gap-2">Transaction & evidence <span className="font-mono text-xs font-normal text-muted-foreground">{sel.line.line_id}</span></span> : "Transaction & evidence"}
          actions={sel && <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={idx <= 0} onClick={() => go(-1)} aria-label="Previous exception"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={idx < 0 || idx >= list.length - 1} onClick={() => go(1)} aria-label="Next exception"><ChevronRight className="h-4 w-4" /></Button>
          </div>}>
          {!sel ? <EmptyState title="Select an exception from the worklist" /> : (
            <div className="space-y-5">
              <ExceptionDetail id={sel.line.line_id} />
              <div>
                <h3 className="mb-2 text-sm font-semibold">Receipt evidence</h3>
                {sel.line.receipt_attached ? (
                  <div className="flex items-center gap-3 rounded-md border border-border bg-secondary/40 p-3">
                    <div className="flex h-16 w-12 items-center justify-center rounded border border-border bg-card"><FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" /></div>
                    <div className="text-xs">
                      <div className="font-medium">receipt_{sel.line.line_id}.pdf <span className="text-muted-foreground">(placeholder)</span></div>
                      <div className="text-muted-foreground">{sel.line.merchant} · {usd(sel.line.amount_usd)} · {fmtDate(sel.line.expense_date)}</div>
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => toast("Not available in demo", { description: "Synthetic data has no real receipt images." })}>Open receipt</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-sev-high/40 bg-sev-high-soft p-3 text-xs text-foreground">
                    <ImageOff className="h-4 w-4 text-sev-high" aria-hidden="true" />No receipt attached to this line.
                  </div>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Same employee, same week</h3>
                <ul className="divide-y divide-border rounded-md border border-border text-xs">
                  {[...lineById.values()].filter((l) => l.employee_id === sel.line.employee_id && l.line_id !== sel.line.line_id && Math.abs(Date.parse(l.expense_date) - Date.parse(sel.line.expense_date)) <= 3 * 86400000).slice(0, 6).map((l) => (
                    <li key={l.line_id} className="grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-1.5">
                      <span className="font-mono">{l.line_id}</span><span className="truncate">{l.merchant} · {l.category} · {fmtDate(l.expense_date)}</span><span className="num">{usd(l.amount_usd)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Panel>

        {/* Decision */}
        <Panel title="Review decision" className="lg:col-start-2 xl:col-start-auto">
          {!sel ? <EmptyState title="No exception selected" /> : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={sel.severity} /><StatusBadge status={status} /></div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Rules triggered</div>
                <div className="flex flex-wrap gap-1">{sel.findings.map((x) => <RuleChip key={x.rule} rule={x.rule} />)}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Explanation</div>
                <p className="text-sm leading-relaxed">{sel.findings.map((x) => `${RULE_BY_ID[x.rule].name}: ${x.explanation}`).join(" ")}</p>
              </div>
              <div>
                <label htmlFor="decision-status" className="mb-1 block text-xs font-medium text-muted-foreground">Review status</label>
                <Select value={status} onValueChange={(v) => { setStatus(sel.line.line_id, v as ReviewStatus); toast.success(`Status set to ${v}`, { description: `${sel.line.line_id} · local demo state` }); }}>
                  <SelectTrigger id="decision-status" className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{(["New", "In Review", "Cleared", "Escalated"] as ReviewStatus[]).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="decision-note" className="mb-1 block text-xs font-medium text-muted-foreground">Reviewer notes</label>
                <Textarea id="decision-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Record what you checked and why." />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="secondary" disabled={!note.trim()} onClick={() => { addNote(sel.line.line_id, note.trim()); setNote(""); toast.success("Note added"); }}>Add Note</Button>
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">Activity history</div>
                <ReviewHistory id={sel.line.line_id} />
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
