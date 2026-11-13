import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Download, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, SimLabel, Kpi, EmptyState } from "@/components/shared/ui-bits";
import { FilterSelect } from "@/components/shared/FilterSelect";
import { SEVERITY_FILL, STATUS_FILL } from "@/components/shared/badges";
import { axisProps, gridProps, tooltipStyle } from "@/components/charts/common";
import { useDemo } from "@/lib/store";
import { RULES } from "@/lib/rules";
import {
  MONTHS,
  monthLabel,
  ruleData,
  categoryDollars,
  severityData,
  sumBy,
  countBy,
} from "@/lib/selectors";
import { usd, usdCompact, int } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import type { ReviewStatus, Severity } from "@/lib/types";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — ClaimCheck" },
      {
        name: "description",
        content: "Exception trends by month, rule, category, merchant, employee and review status.",
      },
      { property: "og:title", content: "Analytics — ClaimCheck" },
      {
        property: "og:description",
        content: "Filterable expense exception analytics on synthetic data.",
      },
    ],
  }),
  component: Analytics,
});

const RANGES = {
  all: ["2026-01", "2026-06"],
  q1: ["2026-01", "2026-03"],
  q2: ["2026-04", "2026-06"],
} as const;

function Analytics() {
  const { flagged, statusOf, employeeName, history, logEvent } = useDemo();
  const [range, setRange] = useState("all");
  const [cat, setCat] = useState("all");
  const [sev, setSev] = useState("all");
  const [rule, setRule] = useState("all");
  const cats = [...new Set(flagged.map((f) => f.line.category))].sort();

  const F = useMemo(
    () =>
      flagged.filter((f) => {
        const m = f.line.expense_date.slice(0, 7);
        const [a, b] =
          RANGES[(range === "all" ? "all" : range) as keyof typeof RANGES] ?? RANGES.all;
        if (range !== "all" && !(m >= a && m <= b)) return false;
        if (cat !== "all" && f.line.category !== cat) return false;
        if (sev !== "all" && f.severity !== sev) return false;
        if (rule !== "all" && !f.findings.some((x) => x.rule === rule)) return false;
        return true;
      }),
    [flagged, range, cat, sev, rule],
  );

  const months = MONTHS.filter(
    (m) => range === "all" || (m >= RANGES[range as "q1"][0] && m <= RANGES[range as "q1"][1]),
  ).map((m) => {
    const inM = F.filter((f) => f.line.expense_date.startsWith(m));
    return {
      month: monthLabel(m),
      High: inM.filter((f) => f.severity === "High").length,
      Medium: inM.filter((f) => f.severity === "Medium").length,
      Low: inM.filter((f) => f.severity === "Low").length,
    };
  });
  const rules = ruleData(F)
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const catD = categoryDollars(F);
  const merchants = [...countBy(F, (f) => f.line.merchant)]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const emps = [
    ...sumBy(
      F,
      (f) => f.line.employee_id,
      () => 1,
    ),
  ]
    .map(([id, value]) => ({ name: employeeName(id), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const sevD = severityData(F);
  const statusD = (["New", "In Review", "Cleared", "Escalated"] as ReviewStatus[]).map((s) => ({
    name: s,
    value: F.filter((f) => statusOf(f.line.line_id) === s).length,
  }));

  // Simulated average review time: elapsed days between first and last status events in demo history.
  const ids = new Set(F.map((f) => f.line.line_id));
  const span = new Map<string, number[]>();
  for (const h of history)
    if (h.lineId && ids.has(h.lineId) && h.type === "Status change")
      (span.get(h.lineId) ?? span.set(h.lineId, []).get(h.lineId)!).push(Date.parse(h.timestamp));
  const bySev = (["High", "Medium", "Low"] as Severity[]).map((s) => {
    const xs = F.filter((f) => f.severity === s)
      .map((f) => span.get(f.line.line_id))
      .filter((v): v is number[] => !!v && v.length > 1)
      .map((v) => (Math.max(...v) - Math.min(...v)) / 86400000);
    return {
      name: s,
      days: xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0,
    };
  });

  const active = [range, cat, sev, rule].filter((x) => x !== "all").length;
  const exportCsv = () => {
    downloadCsv(
      "claimcheck_analytics_synthetic.csv",
      [
        "line_id",
        "expense_date",
        "employee",
        "merchant",
        "category",
        "amount_usd",
        "severity",
        "rules",
        "status",
      ],
      F.map((f) => [
        f.line.line_id,
        f.line.expense_date,
        employeeName(f.line.employee_id),
        f.line.merchant,
        f.line.category,
        f.line.amount_usd.toFixed(2),
        f.severity,
        f.findings.map((x) => x.rule).join("|"),
        statusOf(f.line.line_id),
      ]),
    );
    logEvent({ type: "Export", note: `Analytics export, ${F.length} rows (synthetic).` });
    toast.success(`Exported ${F.length} visible rows`);
  };

  const H = "h-64";
  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Explore where exceptions occur and how review is progressing. All charts follow the filters below."
        actions={
          <>
            <SimLabel />
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!F.length}>
              <Download className="mr-1.5 h-4 w-4" />
              Export visible CSV
            </Button>
          </>
        }
      />
      <Panel className="mb-4" bodyClassName="p-3">
        <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-5">
          <div>
            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Date range
            </span>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              aria-label="Date range"
              className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
            >
              <option value="all">Jan – Jun 2026</option>
              <option value="q1">Q1 2026</option>
              <option value="q2">Q2 2026</option>
            </select>
          </div>
          <FilterSelect
            label="Category"
            value={cat}
            onChange={setCat}
            options={cats.map((c) => ({ value: c, label: c }))}
          />
          <FilterSelect
            label="Severity"
            value={sev}
            onChange={setSev}
            options={["High", "Medium", "Low"].map((c) => ({ value: c, label: c }))}
          />
          <FilterSelect
            label="Rule"
            value={rule}
            onChange={setRule}
            options={RULES.map((r) => ({ value: r.id, label: r.name }))}
          />
          {active > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRange("all");
                setCat("all");
                setSev("all");
                setRule("all");
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>
      </Panel>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4" aria-live="polite">
        <Kpi label="Flagged lines" value={int(F.length)} />
        <Kpi
          label="Flagged dollars"
          value={usdCompact(F.reduce((s, f) => s + f.line.amount_usd, 0))}
        />
        <Kpi
          label="Employees involved"
          value={int(new Set(F.map((f) => f.line.employee_id)).size)}
        />
        <Kpi label="Merchants involved" value={int(new Set(F.map((f) => f.line.merchant)).size)} />
      </div>

      {F.length === 0 ? (
        <Panel>
          <EmptyState
            title="No exceptions match these filters"
            body="Reset filters to see the full picture."
          />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Exceptions by month" description="Stacked by severity">
            <div className={H}>
              <ResponsiveContainer>
                <BarChart data={months}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" {...axisProps} />
                  <YAxis {...axisProps} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {(["High", "Medium", "Low"] as Severity[]).map((s) => (
                    <Bar key={s} dataKey={s} stackId="a" fill={SEVERITY_FILL[s]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Flags by rule">
            <div className={H}>
              <ResponsiveContainer>
                <BarChart data={rules} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid {...gridProps} vertical horizontal={false} />
                  <XAxis type="number" {...axisProps} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={150} {...axisProps} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="value" name="Lines" radius={[0, 4, 4, 0]} barSize={14}>
                    {rules.map((r) => (
                      <Cell key={r.id} fill={SEVERITY_FILL[r.severity]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Flagged dollars by category">
            <div className={H}>
              <ResponsiveContainer>
                <BarChart data={catD} margin={{ bottom: 20 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis
                    dataKey="name"
                    {...axisProps}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis {...axisProps} tickFormatter={usdCompact} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => usd(v)} />
                  <Bar
                    dataKey="value"
                    name="Flagged $"
                    fill="var(--chart-1)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Exceptions by merchant" description="Top 8">
            <div className={H}>
              <ResponsiveContainer>
                <BarChart data={merchants} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid {...gridProps} vertical horizontal={false} />
                  <XAxis type="number" {...axisProps} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={140} {...axisProps} />
                  <Tooltip {...tooltipStyle} />
                  <Bar
                    dataKey="value"
                    name="Exceptions"
                    fill="var(--chart-2)"
                    radius={[0, 4, 4, 0]}
                    barSize={14}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Exceptions by employee" description="Top 8 — a count, not an accusation">
            <div className={H}>
              <ResponsiveContainer>
                <BarChart data={emps} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid {...gridProps} vertical horizontal={false} />
                  <XAxis type="number" {...axisProps} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={130} {...axisProps} />
                  <Tooltip {...tooltipStyle} />
                  <Bar
                    dataKey="value"
                    name="Exceptions"
                    fill="var(--teal)"
                    radius={[0, 4, 4, 0]}
                    barSize={14}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <div className="grid gap-4 sm:grid-cols-2">
            <Panel title="Severity distribution">
              <div className="h-52">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={sevD}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={70}
                      stroke="var(--card)"
                    >
                      {sevD.map((s) => (
                        <Cell key={s.name} fill={SEVERITY_FILL[s.name as Severity]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Review status">
              <div className="h-52">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={statusD}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={70}
                      stroke="var(--card)"
                    >
                      {statusD.map((s) => (
                        <Cell key={s.name} fill={STATUS_FILL[s.name as ReviewStatus]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
          <Panel
            title="Average review time"
            description="Simulated values from demo review history (first to last status change)"
            actions={<SimLabel>Simulated</SimLabel>}
            className="lg:col-span-2"
          >
            <div className="grid grid-cols-3 gap-3">
              {bySev.map((b) => (
                <div key={b.name} className="rounded-md border border-border p-3">
                  <div className="text-xs text-muted-foreground">{b.name} severity</div>
                  <div className="num mt-1 text-xl font-semibold">
                    {b.days ? `${b.days} days` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
