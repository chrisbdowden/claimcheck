import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, RotateCcw, Save, Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PageHeader, Panel, Notice } from "@/components/shared/ui-bits";
import { useDemo } from "@/lib/store";
import { DEFAULT_POLICY } from "@/lib/policy-defaults";
import { runEngine } from "@/lib/demo-engine";
import { validatePolicy } from "@/lib/policy-validation";
import { downloadCsv } from "@/lib/csv";
import { fmtDate, fmtDateTime, usd } from "@/lib/format";
import type { Policy } from "@/lib/types";

export const Route = createFileRoute("/policy")({
  head: () => ({
    meta: [
      { title: "Policy Configuration — ClaimCheck" },
      {
        name: "description",
        content:
          "Edit category limits, thresholds, blocked merchant types, and holiday calendars for the demo ruleset.",
      },
      { property: "og:title", content: "Policy Configuration — ClaimCheck" },
      {
        property: "og:description",
        content: "Browser-local expense policy settings for the ClaimCheck prototype.",
      },
    ],
  }),
  component: PolicyPage,
});

const CATS = Object.keys(DEFAULT_POLICY.categoryLimits);

function PolicyPage() {
  const { policy, setPolicy, resetPolicy, history, lines, flagged, logEvent } = useDemo();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [p, setP] = useState<Policy>(policy);
  const [newBlocked, setNewBlocked] = useState("");
  const [hol, setHol] = useState({ date: "", name: "" });
  useEffect(() => {
    setP(policy);
    setDraft({});
  }, [policy]);

  const num = (k: string, v: number) => draft[k] ?? String(v);
  const setNum = (k: string, raw: string, apply: (n: number, q: Policy) => Policy) => {
    setDraft((d) => ({ ...d, [k]: raw }));
    const n = Number(raw);
    if (raw !== "" && Number.isFinite(n) && n >= 0) setP((q) => apply(n, q));
  };
  const errors = validatePolicy(draft);
  const dirty = JSON.stringify(p) !== JSON.stringify(policy);
  const impact = useMemo(
    () => (dirty ? runEngine(lines, p).size : flagged.length),
    [dirty, lines, p, flagged.length],
  );

  const save = () => {
    if (Object.keys(errors).length) {
      toast.error("Fix invalid values before saving");
      return;
    }
    const changes: string[] = [];
    for (const c of CATS)
      if (p.categoryLimits[c] !== policy.categoryLimits[c])
        changes.push(
          `${c} limit ${usd(policy.categoryLimits[c] ?? 0, 0)} → ${usd(p.categoryLimits[c] ?? 0, 0)}`,
        );
    if (p.receiptThreshold !== policy.receiptThreshold)
      changes.push(`Receipt threshold → ${usd(p.receiptThreshold, 0)}`);
    if (p.roundNumberThreshold !== policy.roundNumberThreshold)
      changes.push(`Round-number threshold → ${usd(p.roundNumberThreshold, 0)}`);
    if (p.blockedMerchantTypes.join() !== policy.blockedMerchantTypes.join())
      changes.push(`Blocked types: ${p.blockedMerchantTypes.join(", ")}`);
    if (p.weekendRestrictedCategories.join() !== policy.weekendRestrictedCategories.join())
      changes.push(`Weekend-restricted: ${p.weekendRestrictedCategories.join(", ")}`);
    if (p.sharedExpenseCategories.join() !== policy.sharedExpenseCategories.join())
      changes.push(`Shared-expense: ${p.sharedExpenseCategories.join(", ")}`);
    if (
      p.holidays.length !== policy.holidays.length ||
      p.holidays.some((h, i) => h.date !== policy.holidays[i]?.date)
    )
      changes.push(`Holidays: ${p.holidays.length} configured`);
    setPolicy(p, changes.join("; ") || "Policy saved");
    toast.success("Policy saved locally", {
      description: `${impact} lines now flagged across the demo dataset.`,
    });
  };

  const exportCsv = () => {
    downloadCsv(
      "claimcheck_policy_demo.csv",
      ["setting", "key", "value"],
      [
        ...CATS.map((c) => ["category_limit", c, p.categoryLimits[c]]),
        ["threshold", "receipt", p.receiptThreshold],
        ["threshold", "round_amount", p.roundNumberThreshold],
        ...p.blockedMerchantTypes.map((t) => ["blocked_merchant_type", t, "true"]),
        ...p.weekendRestrictedCategories.map((t) => ["weekend_restricted", t, "true"]),
        ...p.sharedExpenseCategories.map((t) => ["shared_expense", t, "true"]),
        ...p.holidays.map((h) => ["holiday", h.date, h.name]),
      ],
    );
    logEvent({ type: "Export", note: "Policy CSV exported." });
    toast.success("Policy CSV exported");
  };

  const toggle = (key: "weekendRestrictedCategories" | "sharedExpenseCategories", c: string) =>
    setP((q) => ({
      ...q,
      [key]: q[key].includes(c)
        ? q[key].filter((x) => x !== c)
        : CATS.filter((x) => q[key].includes(x) || x === c),
    }));
  const policyHistory = history.filter((h) => h.type === "Policy change");

  return (
    <>
      <PageHeader
        title="Policy Configuration"
        subtitle="Thresholds and lists the demo rules depend on. Defaults match the documented ClaimCheck policy."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Reset to defaults
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset policy to defaults?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All limits, thresholds and lists return to the documented defaults. Exceptions
                    are recalculated immediately.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      resetPolicy();
                      toast.success("Policy reset to defaults");
                    }}
                  >
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              size="sm"
              onClick={save}
              disabled={!dirty || Object.keys(errors).length > 0}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <Save className="mr-1.5 h-4 w-4" />
              Save changes
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <Notice tone="warn" icon={<ShieldAlert className="h-4 w-4 text-sev-medium" />}>
          <strong>
            Policy changes in this prototype do not modify the production ClaimCheck engine.
          </strong>{" "}
          Edits are stored only in this browser.
        </Notice>
      </div>
      {dirty && (
        <div
          className="mb-4 rounded-md border border-teal/40 bg-accent px-3 py-2 text-sm text-accent-foreground"
          role="status"
        >
          Unsaved changes · preview: <strong>{impact}</strong> lines would be flagged (currently{" "}
          {flagged.length}).
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Expense category limits"
          description="Per-line maximum before Over policy limit fires"
          className="lg:col-span-2"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {CATS.map((c) => {
              const k = `limit:${c}`;
              return (
                <div key={c}>
                  <label htmlFor={k} className="mb-1 block text-xs font-medium">
                    {c}
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-sm text-muted-foreground">$</span>
                    <Input
                      id={k}
                      type="number"
                      min={0}
                      step="1"
                      inputMode="decimal"
                      className="num pl-6"
                      aria-invalid={!!errors[k]}
                      aria-describedby={errors[k] ? `${k}-err` : undefined}
                      value={num(k, p.categoryLimits[c] ?? 0)}
                      onChange={(e) =>
                        setNum(k, e.target.value, (n, q) => ({
                          ...q,
                          categoryLimits: { ...q.categoryLimits, [c]: n },
                        }))
                      }
                    />
                  </div>
                  {errors[k] && (
                    <p id={`${k}-err`} className="mt-1 text-xs text-sev-high">
                      {errors[k]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Global thresholds">
          <div className="space-y-3">
            {(
              [
                [
                  "receipt",
                  "Receipt threshold",
                  "Receipt required above this amount",
                  p.receiptThreshold,
                  (n: number, q: Policy) => ({ ...q, receiptThreshold: n }),
                ],
                [
                  "round",
                  "Round-number threshold",
                  "Whole-dollar amounts at or above this are flagged",
                  p.roundNumberThreshold,
                  (n: number, q: Policy) => ({ ...q, roundNumberThreshold: n }),
                ],
              ] as const
            ).map(([k, label, help, v, apply]) => (
              <div key={k}>
                <label htmlFor={k} className="mb-1 block text-xs font-medium">
                  {label}
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-sm text-muted-foreground">$</span>
                  <Input
                    id={k}
                    type="number"
                    min={0}
                    className="num pl-6"
                    aria-invalid={!!errors[k]}
                    value={num(k, v)}
                    onChange={(e) => setNum(k, e.target.value, apply)}
                  />
                </div>
                <p
                  className={`mt-1 text-xs ${errors[k] ? "text-sev-high" : "text-muted-foreground"}`}
                >
                  {errors[k] ?? help}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Blocked merchant types">
          <ul className="mb-3 flex flex-wrap gap-1.5">
            {p.blockedMerchantTypes.map((t) => (
              <li
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-sev-high/30 bg-sev-high-soft px-2.5 py-1 text-xs text-sev-high"
              >
                {t}
                <button
                  aria-label={`Remove ${t}`}
                  onClick={() =>
                    setP((q) => ({
                      ...q,
                      blockedMerchantTypes: q.blockedMerchantTypes.filter((x) => x !== t),
                    }))
                  }
                  className="rounded-full hover:bg-sev-high/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
            {p.blockedMerchantTypes.length === 0 && (
              <li className="text-xs text-muted-foreground">No blocked types.</li>
            )}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = newBlocked.trim();
              if (!t) return;
              if (p.blockedMerchantTypes.some((x) => x.toLowerCase() === t.toLowerCase())) {
                toast.error(`"${t}" is already blocked`);
                return;
              }
              setP((q) => ({ ...q, blockedMerchantTypes: [...q.blockedMerchantTypes, t] }));
              setNewBlocked("");
            }}
          >
            <Input
              value={newBlocked}
              onChange={(e) => setNewBlocked(e.target.value)}
              placeholder="e.g. Nightclub"
              aria-label="New blocked merchant type"
              className="h-8"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!newBlocked.trim()}>
              <Plus className="h-4 w-4" />
              <span className="sr-only">Add</span>
            </Button>
          </form>
        </Panel>
        {(
          [
            [
              "weekendRestrictedCategories",
              "Weekend-restricted categories",
              "Flagged on Saturdays, Sundays and holidays",
            ],
            [
              "sharedExpenseCategories",
              "Shared-expense categories",
              "Cross-employee duplicate checks apply to these",
            ],
          ] as const
        ).map(([key, title, desc]) => (
          <Panel key={key} title={title} description={desc}>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {CATS.map((c) => (
                <li key={c} className="flex items-center gap-2">
                  <Checkbox
                    id={`${key}-${c}`}
                    checked={p[key].includes(c)}
                    onCheckedChange={() => toggle(key, c)}
                  />
                  <label htmlFor={`${key}-${c}`} className="text-sm">
                    {c}
                  </label>
                </li>
              ))}
            </ul>
          </Panel>
        ))}

        <Panel title="Holiday calendar (2026)" className="lg:col-span-2">
          <ul className="mb-3 divide-y divide-border rounded-md border border-border">
            {p.holidays.map((h) => (
              <li key={h.date} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  <span className="num mr-3 text-muted-foreground">{fmtDate(h.date)}</span>
                  {h.name}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Remove ${h.name}`}
                  onClick={() =>
                    setP((q) => ({ ...q, holidays: q.holidays.filter((x) => x.date !== h.date) }))
                  }
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!hol.date || !hol.name.trim()) return;
              if (p.holidays.some((x) => x.date === hol.date)) {
                toast.error("That date is already a holiday");
                return;
              }
              setP((q) => ({
                ...q,
                holidays: [...q.holidays, { date: hol.date, name: hol.name.trim() }].sort((a, b) =>
                  a.date.localeCompare(b.date),
                ),
              }));
              setHol({ date: "", name: "" });
            }}
          >
            <Input
              type="date"
              min="2026-01-01"
              max="2026-12-31"
              value={hol.date}
              onChange={(e) => setHol({ ...hol, date: e.target.value })}
              aria-label="Holiday date"
              className="h-8 w-auto"
            />
            <Input
              value={hol.name}
              onChange={(e) => setHol({ ...hol, name: e.target.value })}
              placeholder="Holiday name"
              aria-label="Holiday name"
              className="h-8 min-w-[160px] flex-1"
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={!hol.date || !hol.name.trim()}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add holiday
            </Button>
          </form>
        </Panel>
        <Panel title="Policy-change history">
          {policyHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No policy changes yet. Defaults in effect.
            </p>
          ) : (
            <ol className="space-y-2.5 text-xs">
              {policyHistory.map((h) => (
                <li key={h.id}>
                  <div className="text-muted-foreground">
                    {fmtDateTime(h.timestamp)} · {h.user}
                  </div>
                  <div>{h.note}</div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}
