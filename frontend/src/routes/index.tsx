import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  ScanSearch,
  FileStack,
  Flag,
  DollarSign,
  AlertOctagon,
  Percent,
  CheckCheck,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, Kpi, SimLabel } from "@/components/shared/ui-bits";
import { SeverityBadge, StatusBadge, RuleChip, SEVERITY_FILL } from "@/components/shared/badges";
import { axisProps, gridProps, tooltipStyle } from "@/components/charts/common";
import { useDemo, DATE_PRESETS } from "@/lib/store";
import { severityData, ruleData, categoryDollars, weekly, REVIEWED } from "@/lib/selectors";
import { usd, usdCompact, pct, int, fmtDate } from "@/lib/format";
import { ExceptionDrawer } from "@/components/exceptions/ExceptionDrawer";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Expense Controls Overview — ClaimCheck" },
      {
        name: "description",
        content:
          "Monitor expense activity, identify exceptions, and prioritize financial review with ClaimCheck.",
      },
      { property: "og:title", content: "Expense Controls Overview — ClaimCheck" },
      { property: "og:description", content: "Every expense reviewed. Every exception explained." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { lines, flagged, inRange, datePreset, statusOf, employeeName } = useDemo();
  const [open, setOpen] = useState<string | null>(null);
  const L = useMemo(() => lines.filter((l) => inRange(l.expense_date)), [lines, inRange]);
  const F = useMemo(() => flagged.filter((f) => inRange(f.line.expense_date)), [flagged, inRange]);
  const dollars = F.reduce((s, f) => s + f.line.amount_usd, 0);
  const high = F.filter((f) => f.severity === "High");
  const reviewed = F.filter((f) => REVIEWED.includes(statusOf(f.line.line_id))).length;
  const sev = severityData(F);
  const rules = ruleData(F).sort((a, b) => b.value - a.value);
  const cats = categoryDollars(F);
  const trend = weekly(L, new Set(F.map((f) => f.line.line_id)));
  const recent = high
    .filter((f) => statusOf(f.line.line_id) !== "Cleared")
    .sort((a, b) => b.line.expense_date.localeCompare(a.line.expense_date))
    .slice(0, 6);
  const dupHigh = high.filter((f) =>
    f.findings.some((x) => x.rule === "exact_duplicate" || x.rule === "near_duplicate"),
  ).length;
  const over = F.filter((f) => f.findings.some((x) => x.rule === "over_limit")).length;
  const missing = F.filter((f) => f.findings.some((x) => x.rule === "missing_receipt"));
  const round = F.filter((f) =>
    f.findings.some((x) => x.rule === "round_amount" || x.rule === "cross_employee_duplicate"),
  ).length;

  return (
    <>
      <PageHeader
        title="Expense Controls Overview"
        subtitle="Monitor expense activity, identify exceptions, and prioritize financial review."
        actions={
          <>
            <SimLabel />
            <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
              <Link to="/analysis">
                <ScanSearch className="mr-1.5 h-4 w-4" />
                Analyze Expenses
              </Link>
            </Button>
          </>
        }
      />
      <p className="sr-only" aria-live="polite">
        Showing {DATE_PRESETS[datePreset].label}
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Expense lines reviewed"
          value={int(L.length)}
          sub={DATE_PRESETS[datePreset].label}
          icon={<FileStack className="h-4 w-4" />}
        />
        <Kpi
          label="Transactions flagged"
          value={int(F.length)}
          sub={`${int(F.reduce((s, f) => s + f.findings.length, 0))} rule-level findings`}
          icon={<Flag className="h-4 w-4" />}
          tip="Unique expense lines with at least one finding. One line can trigger several rules, so rule-level findings exceed flagged lines."
        />
        <Kpi
          label="Total dollars flagged"
          value={usdCompact(dollars)}
          sub={usd(dollars)}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <Kpi
          label="High-severity exceptions"
          value={int(high.length)}
          sub={`${pct(F.length ? high.length / F.length : 0, 0)} of flagged`}
          icon={<AlertOctagon className="h-4 w-4 text-sev-high" />}
        />
        <Kpi
          label="Exception rate"
          value={pct(L.length ? F.length / L.length : 0)}
          sub="Flagged ÷ lines reviewed"
          icon={<Percent className="h-4 w-4" />}
        />
        <Kpi
          label="Review completion"
          value={pct(F.length ? reviewed / F.length : 0, 0)}
          sub={`${reviewed} of ${F.length} cleared or escalated`}
          icon={<CheckCheck className="h-4 w-4" />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          title="Exceptions by severity"
          description="Unique flagged lines, highest severity per line"
        >
          <div className="relative h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={sev}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={88}
                  paddingAngle={2}
                  stroke="var(--card)"
                >
                  {sev.map((s) => (
                    <Cell key={s.name} fill={SEVERITY_FILL[s.name as keyof typeof SEVERITY_FILL]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="num text-2xl font-semibold">{F.length}</span>
              <span className="text-[11px] text-muted-foreground">flagged</span>
            </div>
          </div>
          <ul className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            {sev.map((s) => (
              <li key={s.name}>
                <SeverityBadge severity={s.name as "High"} />
                <div className="num mt-1 font-semibold">{s.value}</div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          title="Flags by detection rule"
          description="Lines triggering each rule"
          className="lg:col-span-2"
        >
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={rules} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" {...axisProps} allowDecimals={false} />
                <YAxis type="category" dataKey="name" {...axisProps} width={150} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="value" name="Flagged lines" radius={[0, 4, 4, 0]} barSize={16}>
                  {rules.map((r) => (
                    <Cell key={r.id} fill={SEVERITY_FILL[r.severity]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Panel
          title="Expense activity over time"
          description="Weekly lines submitted vs. lines flagged"
          className="lg:col-span-3"
        >
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ right: 10 }}>
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="week"
                  {...axisProps}
                  tickFormatter={(w) => fmtDate(w).replace(", 2026", "")}
                  minTickGap={24}
                />
                <YAxis yAxisId="l" {...axisProps} />
                <YAxis yAxisId="r" orientation="right" {...axisProps} />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(w) => `Week of ${fmtDate(String(w))}`}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  yAxisId="l"
                  type="monotone"
                  dataKey="lines"
                  name="Lines submitted"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="r"
                  type="monotone"
                  dataKey="flagged"
                  name="Lines flagged"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Flagged dollars by category" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={cats} margin={{ bottom: 30 }}>
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="name"
                  {...axisProps}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis {...axisProps} tickFormatter={(v) => usdCompact(v)} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => usd(v)} />
                <Bar dataKey="value" name="Flagged $" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          title="Recent high-priority exceptions"
          className="lg:col-span-2"
          bodyClassName="p-0"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/exceptions">
                View queue <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Line</th>
                  <th className="px-2 py-2 font-medium">Employee</th>
                  <th className="px-2 py-2 font-medium">Merchant</th>
                  <th className="px-2 py-2 font-medium">Rules</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((f) => (
                  <tr
                    key={f.line.line_id}
                    className="cursor-pointer border-t border-border hover:bg-secondary/40"
                    onClick={() => setOpen(f.line.line_id)}
                  >
                    <td className="px-4 py-2">
                      <button
                        className="font-mono text-xs text-teal hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpen(f.line.line_id);
                        }}
                      >
                        {f.line.line_id}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {employeeName(f.line.employee_id)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{f.line.merchant}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {f.findings.map((x) => (
                          <RuleChip key={x.rule} rule={x.rule} />
                        ))}
                      </div>
                    </td>
                    <td className="num px-2 py-2 text-right font-medium">
                      {usd(f.line.amount_usd)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={statusOf(f.line.line_id)} />
                    </td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      No open high-severity exceptions in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Lightbulb className="h-4 w-4 text-sev-medium" aria-hidden="true" />
              Controls Insights
            </span>
          }
          actions={<SimLabel>Derived from synthetic data</SimLabel>}
        >
          <ul className="space-y-3 text-sm">
            <li className="border-l-2 border-sev-high pl-3">
              <strong>
                {dupHigh} of {high.length}
              </strong>{" "}
              high-severity findings are duplicate or near-duplicate claims — a notable share.
            </li>
            <li className="border-l-2 border-sev-medium pl-3">
              <strong>{over}</strong> transactions exceed configured category limits.
            </li>
            <li className="border-l-2 border-sev-medium pl-3">
              <strong>{missing.length}</strong> missing receipts (
              {usd(
                missing.reduce((s, f) => s + f.line.amount_usd, 0),
                0,
              )}
              ) need reviewer follow-up.
            </li>
            <li className="border-l-2 border-sev-low pl-3">
              <strong>{round}</strong> repeated or round amounts may be legitimate shared or
              fixed-fee expenses — check context before escalating.
            </li>
          </ul>
        </Panel>
      </div>
      <ExceptionDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}
