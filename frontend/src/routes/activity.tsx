import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Panel, Notice, EmptyState } from "@/components/shared/ui-bits";
import { FilterSelect } from "@/components/shared/FilterSelect";
import { StatusBadge } from "@/components/shared/badges";
import { useDemo } from "@/lib/store";
import { downloadCsv } from "@/lib/csv";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity & Audit Trail — ClaimCheck" },
      { name: "description", content: "Prototype history of review status changes, notes, policy edits and exports." },
      { property: "og:title", content: "Activity & Audit Trail — ClaimCheck" },
      { property: "og:description", content: "Simulated review activity log for the ClaimCheck prototype." },
    ],
  }),
  component: Activity,
});

const TYPES = ["Status change", "Note added", "Policy change", "Analysis run", "Export", "Settings change"];
const PAGE = 40;

function Activity() {
  const { history, logEvent } = useDemo();
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [n, setN] = useState(PAGE);
  const rows = useMemo(() => history.filter((h) => (type === "all" || h.type === type) && (!from || h.timestamp.slice(0, 10) >= from) && (!to || h.timestamp.slice(0, 10) <= to)), [history, type, from, to]);
  const exportCsv = () => {
    downloadCsv("claimcheck_activity_prototype.csv", ["timestamp", "user", "event_type", "line_id", "previous_status", "new_status", "note"],
      rows.map((h) => [h.timestamp, h.user, h.type, h.lineId ?? "", h.previousStatus ?? "", h.newStatus ?? "", h.note ?? ""]));
    logEvent({ type: "Export", note: `Activity export, ${rows.length} events.` });
    toast.success(`Exported ${rows.length} events`, { description: "Mock export — not a certified audit record." });
  };
  return (
    <>
      <PageHeader title="Activity & Audit Trail" subtitle="Who did what, and when, during review."
        actions={<Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}><Download className="mr-1.5 h-4 w-4" />Export</Button>} />
      <div className="mb-4"><Notice tone="warn" icon={<ShieldAlert className="h-4 w-4 text-sev-medium" />}><strong>Prototype audit-history view, not a tamper-proof audit system.</strong> Events are simulated or stored in this browser and can be reset.</Notice></div>
      <Panel className="mb-4" bodyClassName="p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <FilterSelect label="Activity type" value={type} onChange={(v) => { setType(v); setN(PAGE); }} options={TYPES.map((t) => ({ value: t, label: t }))} />
          <div><label htmlFor="af" className="mb-1 block text-[11px] font-medium text-muted-foreground">From</label><Input id="af" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs" /></div>
          <div><label htmlFor="at" className="mb-1 block text-[11px] font-medium text-muted-foreground">To</label><Input id="at" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs" /></div>
        </div>
      </Panel>
      <Panel bodyClassName="p-0" title={`${rows.length} events`}>
        {rows.length === 0 ? <EmptyState title="No activity matches these filters" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>{["Timestamp", "User", "Event type", "Line ID", "Previous", "New", "Reviewer note"].map((h) => <th key={h} className="px-3 py-2 font-medium first:pl-4">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, n).map((h) => (
                  <tr key={h.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2 pl-4 text-xs text-muted-foreground">{fmtDateTime(h.timestamp)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{h.user}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-medium">{h.type}</td>
                    <td className="px-3 py-2 font-mono text-xs">{h.lineId ?? "—"}</td>
                    <td className="px-3 py-2">{h.previousStatus ? <StatusBadge status={h.previousStatus} /> : "—"}</td>
                    <td className="px-3 py-2">{h.newStatus ? <StatusBadge status={h.newStatus} /> : "—"}</td>
                    <td className="max-w-[360px] px-3 py-2 text-xs text-muted-foreground">{h.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {n < rows.length && <div className="border-t border-border p-3 text-center"><Button variant="outline" size="sm" onClick={() => setN(n + PAGE)}>Show more ({rows.length - n} remaining)</Button></div>}
          </div>
        )}
      </Panel>
    </>
  );
}
