import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, MoreHorizontal, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader, Panel, EmptyState, SimLabel } from "@/components/shared/ui-bits";
import { FilterSelect } from "@/components/shared/FilterSelect";
import { SeverityBadge, StatusBadge, RuleChip } from "@/components/shared/badges";
import { ExceptionDrawer } from "@/components/exceptions/ExceptionDrawer";
import { useDemo } from "@/lib/store";
import { RULES, SEVERITY_RANK } from "@/lib/rules";
import { EMPLOYEES } from "@/data/synthetic/dataset";
import { usd, fmtDate, int } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import type { FlaggedLine, ReviewStatus } from "@/lib/types";

export const Route = createFileRoute("/exceptions")({
  head: () => ({
    meta: [
      { title: "Exception Queue — ClaimCheck" },
      { name: "description", content: "Sort, filter and review flagged expense exceptions by severity, rule, and status." },
      { property: "og:title", content: "Exception Queue — ClaimCheck" },
      { property: "og:description", content: "Prioritized expense exceptions with plain-language explanations." },
    ],
  }),
  component: ExceptionQueue,
});

type SortKey = "severity" | "line" | "report" | "employee" | "date" | "merchant" | "category" | "amount" | "status";
const STATUSES: ReviewStatus[] = ["New", "In Review", "Cleared", "Escalated"];
const PAGE = 25;

function ExceptionQueue() {
  const { flagged, statusOf, setStatus, employeeName, inRange, settings, logEvent } = useDemo();
  const [q, setQ] = useState("");
  const [sev, setSev] = useState<string>(settings.defaultSeverity);
  const [rule, setRule] = useState("all");
  const [cat, setCat] = useState("all");
  const [emp, setEmp] = useState("all");
  const [merchant, setMerchant] = useState("all");
  const [status, setStatusF] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "severity", dir: -1 });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  const base = flagged.filter((f) => inRange(f.line.expense_date));
  const merchants = [...new Set(base.map((f) => f.line.merchant))].sort();
  const cats = [...new Set(base.map((f) => f.line.category))].sort();

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const r = base.filter((f) => {
      const l = f.line;
      if (sev !== "all" && f.severity !== sev) return false;
      if (rule !== "all" && !f.findings.some((x) => x.rule === rule)) return false;
      if (cat !== "all" && l.category !== cat) return false;
      if (emp !== "all" && l.employee_id !== emp) return false;
      if (merchant !== "all" && l.merchant !== merchant) return false;
      if (status !== "all" && statusOf(l.line_id) !== status) return false;
      if (from && l.expense_date < from) return false;
      if (to && l.expense_date > to) return false;
      if (min && l.amount_usd < Number(min)) return false;
      if (max && l.amount_usd > Number(max)) return false;
      if (ql && ![l.line_id, l.report_id, l.merchant, l.description, l.employee_id, employeeName(l.employee_id)].some((s) => s.toLowerCase().includes(ql))) return false;
      return true;
    });
    const val = (f: FlaggedLine): string | number => {
      switch (sort.key) {
        case "severity": return SEVERITY_RANK[f.severity] * 1e7 + f.line.amount_usd;
        case "line": return f.line.line_id; case "report": return f.line.report_id;
        case "employee": return employeeName(f.line.employee_id); case "date": return f.line.expense_date;
        case "merchant": return f.line.merchant; case "category": return f.line.category;
        case "amount": return f.line.amount_usd; case "status": return STATUSES.indexOf(statusOf(f.line.line_id));
      }
    };
    return r.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [base, q, sev, rule, cat, emp, merchant, status, from, to, min, max, sort, statusOf, employeeName]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);
  const reset = () => { setQ(""); setSev("all"); setRule("all"); setCat("all"); setEmp("all"); setMerchant("all"); setStatusF("all"); setFrom(""); setTo(""); setMin(""); setMax(""); setPage(0); };
  const active = [q, sev !== "all", rule !== "all", cat !== "all", emp !== "all", merchant !== "all", status !== "all", from, to, min, max].filter(Boolean).length;
  const S = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(0); };

  const Th = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => {
    const on = sort.key === k;
    return (
      <th scope="col" className={`whitespace-nowrap px-2 py-2 font-medium ${right ? "text-right" : ""}`} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button className={`inline-flex items-center gap-1 hover:text-foreground ${on ? "text-foreground" : ""}`} onClick={() => setSort({ key: k, dir: on ? (sort.dir === 1 ? -1 : 1) : -1 })}>
          {children}{on ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
        </button>
      </th>
    );
  };

  const exportCsv = () => {
    downloadCsv("claimcheck_exceptions_synthetic.csv",
      ["severity", "line_id", "report_id", "employee_id", "employee", "expense_date", "merchant", "category", "amount_usd", "rules", "status"],
      rows.map((f) => [f.severity, f.line.line_id, f.line.report_id, f.line.employee_id, employeeName(f.line.employee_id), f.line.expense_date, f.line.merchant, f.line.category, f.line.amount_usd.toFixed(2), f.findings.map((x) => x.rule).join("|"), statusOf(f.line.line_id)]));
    logEvent({ type: "Export", note: `Exported ${rows.length} exception rows (synthetic).` });
    toast.success(`Exported ${rows.length} rows`, { description: "Synthetic data only." });
  };

  return (
    <>
      <PageHeader title="Exception Queue" subtitle="Flagged expense lines, ordered by severity then amount. Click any row for findings, evidence and review actions."
        actions={<><SimLabel /><Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Export CSV</Button></>} />

      <Panel className="mb-4" bodyClassName="p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-[220px] flex-1">
              <label htmlFor="q" className="sr-only">Search exceptions</label>
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input id="q" value={q} onChange={(e) => S(setQ)(e.target.value)} placeholder="Search line, report, employee, merchant, description…" className="h-8 pl-8 text-sm" />
            </div>
            {active > 0 && <Button variant="ghost" size="sm" onClick={reset}><X className="mr-1 h-3.5 w-3.5" />Clear {active} filter{active > 1 ? "s" : ""}</Button>}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <FilterSelect label="Severity" value={sev} onChange={S(setSev)} options={["High", "Medium", "Low"].map((v) => ({ value: v, label: v }))} />
            <FilterSelect label="Detection rule" value={rule} onChange={S(setRule)} options={RULES.map((r) => ({ value: r.id, label: r.name }))} />
            <FilterSelect label="Category" value={cat} onChange={S(setCat)} options={cats.map((v) => ({ value: v, label: v }))} />
            <FilterSelect label="Employee" value={emp} onChange={S(setEmp)} options={EMPLOYEES.map((e) => ({ value: e.id, label: e.name }))} />
            <FilterSelect label="Merchant" value={merchant} onChange={S(setMerchant)} options={merchants.map((v) => ({ value: v, label: v }))} />
            <FilterSelect label="Review status" value={status} onChange={S(setStatusF)} options={STATUSES.map((v) => ({ value: v, label: v }))} />
            <div>
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Date range</span>
              <div className="flex gap-1">
                <Input type="date" aria-label="From date" value={from} min="2026-01-01" max="2026-06-30" onChange={(e) => S(setFrom)(e.target.value)} className="h-8 px-1.5 text-xs" />
                <Input type="date" aria-label="To date" value={to} min="2026-01-01" max="2026-06-30" onChange={(e) => S(setTo)(e.target.value)} className="h-8 px-1.5 text-xs" />
              </div>
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Amount range ($)</span>
              <div className="flex gap-1">
                <Input type="number" min={0} inputMode="decimal" aria-label="Minimum amount" placeholder="Min" value={min} onChange={(e) => S(setMin)(e.target.value)} className="h-8 px-1.5 text-xs" />
                <Input type="number" min={0} inputMode="decimal" aria-label="Maximum amount" placeholder="Max" value={max} onChange={(e) => S(setMax)(e.target.value)} className="h-8 px-1.5 text-xs" />
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel bodyClassName="p-0" title={<span aria-live="polite">{int(rows.length)} exceptions <span className="font-normal text-muted-foreground">· {usd(rows.reduce((s, f) => s + f.line.amount_usd, 0))}</span></span>}>
        {rows.length === 0 ? (
          <EmptyState title="No exceptions match these filters" body="Try widening the date range or clearing a filter." action={<Button size="sm" variant="outline" onClick={reset}>Clear filters</Button>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <Th k="severity">Severity</Th><Th k="line">Line ID</Th><Th k="report">Report</Th><Th k="employee">Employee</Th>
                    <Th k="date">Date</Th><Th k="merchant">Merchant</Th><Th k="category">Category</Th><Th k="amount" right>Amount</Th>
                    <th scope="col" className="px-2 py-2 font-medium">Detection rules</th><Th k="status">Status</Th>
                    <th scope="col" className="px-2 py-2 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {view.map((f) => {
                    const id = f.line.line_id;
                    return (
                      <tr key={id} className="cursor-pointer border-t border-border hover:bg-secondary/40" onClick={() => setOpen(id)}>
                        <td className="px-2 py-2 pl-4"><SeverityBadge severity={f.severity} /></td>
                        <td className="px-2 py-2"><button className="font-mono text-xs text-teal hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(id); }}>{id}</button></td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-muted-foreground">{f.line.report_id}</td>
                        <td className="whitespace-nowrap px-2 py-2">{employeeName(f.line.employee_id)}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{fmtDate(f.line.expense_date)}</td>
                        <td className="whitespace-nowrap px-2 py-2">{f.line.merchant}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{f.line.category}</td>
                        <td className="num whitespace-nowrap px-2 py-2 text-right font-medium">{usd(f.line.amount_usd)}</td>
                        <td className="px-2 py-2"><div className="flex max-w-[260px] flex-wrap gap-1">{f.findings.map((x) => <RuleChip key={x.rule} rule={x.rule} />)}</div></td>
                        <td className="px-2 py-2"><StatusBadge status={statusOf(id)} /></td>
                        <td className="px-2 py-2 pr-4" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${id}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setOpen(id)}>View details</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {STATUSES.filter((s) => s !== "New").map((s) => (
                                <DropdownMenuItem key={s} disabled={statusOf(id) === s} onSelect={() => { setStatus(id, s); toast.success(`${id} → ${s}`); }}>
                                  {s === "In Review" ? "Mark In Review" : s === "Cleared" ? "Clear exception" : "Escalate"}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              <span>Showing {page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} of {rows.length}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </Panel>
      <ExceptionDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}
