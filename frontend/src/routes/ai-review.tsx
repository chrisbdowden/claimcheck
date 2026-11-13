import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Cpu, FileText, ShieldCheck, Loader2, RefreshCw, Ban, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, Panel, Notice, SimLabel } from "@/components/shared/ui-bits";
import { SeverityBadge, RuleChip } from "@/components/shared/badges";
import { useDemo, type Provider } from "@/lib/store";
import { RULE_BY_ID } from "@/lib/rules";
import { usd, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FlaggedLine } from "@/lib/types";

export const Route = createFileRoute("/ai-review")({
  head: () => ({
    meta: [
      { title: "AI Review (Simulated) — ClaimCheck" },
      {
        name: "description",
        content:
          "How ClaimCheck could use AI for exception explanations and description-mismatch review — fully simulated.",
      },
      { property: "og:title", content: "AI Review (Simulated) — ClaimCheck" },
      {
        property: "og:description",
        content: "Simulated AI explanations with human-review governance controls.",
      },
    ],
  }),
  component: AiReview,
});

const PROVIDERS: { id: Provider; name: string; sub: string }[] = [
  { id: "grok", name: "Grok / xAI", sub: "Simulated provider" },
  { id: "claude", name: "Claude / Anthropic", sub: "Simulated provider" },
  { id: "offline", name: "Offline heuristic mode", sub: "Templates + keyword checks, no model" },
];

function template(f: FlaggedLine, name: (id: string) => string) {
  const l = f.line;
  return `${l.line_id} (${name(l.employee_id)}, ${usd(l.amount_usd)} at ${l.merchant}) triggered ${f.findings.length} rule${f.findings.length > 1 ? "s" : ""}: ${f.findings.map((x) => RULE_BY_ID[x.rule].name).join(", ")}. Severity: ${f.severity}. Review required.`;
}
function simulatedAi(f: FlaggedLine, name: (id: string) => string) {
  const l = f.line;
  const r = f.findings.map((x) => x.rule);
  const parts: string[] = [];
  if (r.includes("exact_duplicate") || r.includes("near_duplicate"))
    parts.push(
      `This looks like the same ${l.category.toLowerCase()} charge at ${l.merchant} being claimed again. It may be an accidental double submission, or two genuinely separate visits that happen to match.`,
    );
  if (r.includes("cross_employee_duplicate"))
    parts.push(
      `Another employee claimed an identical amount at the same merchant on the same day — typical when one shared bill is submitted by two people.`,
    );
  if (r.includes("over_limit"))
    parts.push(
      `The amount is above the ${l.category} limit; there may be a valid business reason, such as a larger group or peak pricing.`,
    );
  if (r.includes("missing_receipt"))
    parts.push(
      `No receipt is attached, so the amount and merchant can't be confirmed from documentation.`,
    );
  if (r.includes("split_transaction"))
    parts.push(
      `Several same-day purchases together exceed the limit, a pattern sometimes used to stay under approval thresholds.`,
    );
  if (r.includes("blocked_category"))
    parts.push(
      `The merchant type is on the blocked list, so reimbursement would normally need explicit justification.`,
    );
  if (r.includes("weekend_holiday"))
    parts.push(
      `This category is normally a working-day expense, but it is dated on a weekend or holiday.`,
    );
  if (r.includes("round_amount"))
    parts.push(
      `The whole-dollar amount could be an estimate rather than an actual charge, though fixed fees are often round.`,
    );
  if (r.includes("description_mismatch"))
    parts.push(
      `The description “${l.description}” doesn't fit a ${l.category.toLowerCase()} expense at ${l.merchant}.`,
    );
  return `${name(l.employee_id)}'s ${usd(l.amount_usd)} expense on ${fmtDate(l.expense_date)}: ${parts.join(" ")}`;
}
function steps(f: FlaggedLine) {
  const r = new Set(f.findings.map((x) => x.rule));
  const s: string[] = [];
  if (r.has("exact_duplicate") || r.has("near_duplicate") || r.has("cross_employee_duplicate"))
    s.push("Compare both receipts and card statements for distinct transaction references.");
  if (r.has("missing_receipt")) s.push("Request the itemized receipt from the employee.");
  if (r.has("over_limit") || r.has("split_transaction"))
    s.push("Check for pre-approval or a documented business reason.");
  if (r.has("blocked_category"))
    s.push("Confirm whether a policy exception was granted in advance.");
  if (r.has("description_mismatch")) s.push("Ask the employee to clarify what was purchased.");
  if (r.has("weekend_holiday") || r.has("round_amount"))
    s.push("Confirm the date and amount against the receipt.");
  s.push("Record your conclusion and rationale in reviewer notes.");
  return s;
}

function AiReview() {
  const { flagged, provider, setProvider, employeeName, settings } = useDemo();
  const choices = useMemo(() => flagged.slice(0, 40), [flagged]);
  const [id, setId] = useState(choices[0]?.line.line_id ?? "");
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("done");
  const f = flagged.find((x) => x.line.line_id === id) ?? choices[0];
  const regenerate = () => {
    setPhase("loading");
    setTimeout(() => setPhase("done"), 900);
  };
  useEffect(() => {
    regenerate();
  }, [id, provider]);
  const provName = PROVIDERS.find((p) => p.id === provider)!.name;

  return (
    <>
      <PageHeader
        title="AI Review"
        subtitle="How AI could assist reviewers by explaining findings and spotting description mismatches. Everything on this page is simulated."
        actions={<SimLabel>Simulated · no model calls</SimLabel>}
      />
      <div className="mb-4">
        <Notice icon={<Cpu className="h-4 w-4" />}>
          Deterministic rules identify most exceptions. AI only adds interpretive help.{" "}
          <strong>No model-provider requests occur in this mockup</strong> and no API keys are
          needed.
        </Notice>
      </div>

      <Panel title="Provider (simulated setting)" className="mb-4">
        <div role="radiogroup" aria-label="AI provider" className="grid gap-3 md:grid-cols-3">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={provider === p.id}
              onClick={() => {
                setProvider(p.id);
                toast(`Provider set to ${p.name}`, {
                  description: "Simulated — no connection made.",
                });
              }}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                provider === p.id
                  ? "border-teal bg-accent ring-2 ring-teal/20"
                  : "border-border hover:border-teal/40",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.name}</span>
                {provider === p.id && <Check className="h-4 w-4 text-teal" />}
              </div>
              <div className="text-xs text-muted-foreground">{p.sub}</div>
            </button>
          ))}
        </div>
      </Panel>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-teal" />
              Exception Explanation
            </span>
          }
        >
          <p className="text-sm text-muted-foreground">
            Turns deterministic rule findings into concise business-language explanations with
            suggested verification steps. {settings.aiExplanations ? "Enabled" : "Disabled"} in
            Settings.
          </p>
        </Panel>
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-teal" />
              Description Mismatch Review
            </span>
          }
        >
          <p className="text-sm text-muted-foreground">
            Assesses whether a description fits its merchant and category. In this prototype it runs
            as an offline keyword heuristic. {settings.aiMismatch ? "Enabled" : "Disabled"} in
            Settings.
          </p>
        </Panel>
      </div>

      {f && (
        <Panel
          title="AI explanation panel"
          actions={
            <Button size="sm" variant="outline" onClick={regenerate} disabled={phase === "loading"}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Regenerate
            </Button>
          }
        >
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
            <div className="md:w-96">
              <label htmlFor="ai-line" className="mb-1 block text-xs font-medium">
                Selected expense
              </label>
              <Select value={f.line.line_id} onValueChange={setId}>
                <SelectTrigger id="ai-line">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((c) => (
                    <SelectItem key={c.line.line_id} value={c.line.line_id}>
                      {c.line.line_id} · {c.line.merchant} · {usd(c.line.amount_usd)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <SeverityBadge severity={f.severity} />
              {f.findings.map((x) => (
                <RuleChip key={x.rule} rule={x.rule} />
              ))}
              <span className="rounded border border-border px-1.5 py-0.5">
                Provider: {provName}
              </span>
              <span
                className="rounded border border-dashed border-teal/50 bg-accent px-1.5 py-0.5 text-accent-foreground"
                aria-live="polite"
              >
                {phase === "loading" ? "Simulating…" : "Simulated output"}
              </span>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Deterministic rule detail
              </h3>
              <ul className="space-y-2 text-sm">
                {f.findings.map((x) => (
                  <li key={x.rule}>
                    <strong>{RULE_BY_ID[x.rule].name}.</strong> {x.explanation}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-border p-3">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Offline template explanation
              </h3>
              <p className="text-sm">{template(f, employeeName)}</p>
            </div>
            <div
              className={cn(
                "rounded-md border p-3",
                provider === "offline"
                  ? "border-dashed border-border opacity-70"
                  : "border-teal/40 bg-accent/40",
              )}
            >
              <h3 className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                Simulated AI-enhanced
              </h3>
              {provider === "offline" ? (
                <p className="text-sm text-muted-foreground">
                  Offline mode selected — the template explanation is used. Choose a simulated
                  provider to preview AI-style output.
                </p>
              ) : phase === "loading" ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating simulated text…
                </p>
              ) : (
                <p className="text-sm">{simulatedAi(f, employeeName)}</p>
              )}
            </div>
          </div>
          <div className="mt-4">
            <h3 className="mb-1.5 text-sm font-semibold">Suggested reviewer verification steps</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {steps(f).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        </Panel>
      )}

      <Panel
        className="mt-4"
        title={
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-success" />
            Governance controls
          </span>
        }
      >
        <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["AI cannot change policy thresholds.", Ban],
            ["AI cannot override deterministic findings.", Ban],
            ["AI cannot approve expenses.", Ban],
            ["AI output requires human review.", ShieldCheck],
            ["Offline operation remains available.", ShieldCheck],
            ["No model-provider requests occur in this mockup.", ShieldCheck],
          ].map(([t, I]) => {
            const Icon = I as typeof Ban;
            return (
              <li
                key={t as string}
                className="flex items-start gap-2 rounded-md border border-border p-2.5"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
                {t as string}
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
