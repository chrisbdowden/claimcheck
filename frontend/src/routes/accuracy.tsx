import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { BookMarked, FlaskConical, Info } from "lucide-react";
import { PageHeader, Panel, Kpi, InfoTip, Notice, SimLabel } from "@/components/shared/ui-bits";
import { SeverityBadge } from "@/components/shared/badges";
import { SYNTHETIC_LINES } from "@/data/synthetic/dataset";
import { runEngine, evaluate } from "@/lib/demo-engine";
import { DEFAULT_POLICY } from "@/lib/policy-defaults";
import { RULE_BY_ID } from "@/lib/rules";
import { pct, int } from "@/lib/format";

export const Route = createFileRoute("/accuracy")({
  head: () => ({
    meta: [
      { title: "Detection Accuracy — ClaimCheck" },
      {
        name: "description",
        content:
          "Rule-level and transaction-level precision and recall on synthetic planted-answer data.",
      },
      { property: "og:title", content: "Detection Accuracy — ClaimCheck" },
      {
        property: "og:description",
        content: "How well ClaimCheck's demo ruleset finds planted exceptions.",
      },
    ],
  }),
  component: Accuracy,
});

const PRECISION =
  "Precision: of everything flagged, the share that was a real (planted) exception. Low precision means reviewers waste time on false alarms.";
const RECALL =
  "Recall: of all real (planted) exceptions, the share that was flagged. Low recall means problems slip through unreviewed.";
const ratio = (a: number, b: number) => (b ? a / b : 0);

function Accuracy() {
  const e = useMemo(
    () => evaluate(SYNTHETIC_LINES, runEngine(SYNTHETIC_LINES, DEFAULT_POLICY)),
    [],
  );
  const rFp = e.rule.detected - e.rule.tp;
  const rMiss = e.rule.planted - e.rule.tp;
  return (
    <>
      <PageHeader
        title="Detection Accuracy"
        subtitle="How the frontend demonstration ruleset performs against synthetic planted-answer labels, using default policy."
        actions={<SimLabel>Synthetic evaluation</SimLabel>}
      />
      <div className="mb-4">
        <Notice icon={<Info className="h-4 w-4" />}>
          Figures below are <strong>measured in your browser</strong> by comparing this prototype's
          rules to the planted labels in the synthetic dataset. They are not production performance
          and have not been independently verified.
        </Notice>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
        Prototype ruleset · measured on synthetic data
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Rule-level precision"
          value={pct(ratio(e.rule.tp, e.rule.detected))}
          sub={`${e.rule.tp} of ${e.rule.detected} detections`}
          tip={PRECISION}
        />
        <Kpi
          label="Rule-level recall"
          value={pct(ratio(e.rule.tp, e.rule.planted))}
          sub={`${e.rule.tp} of ${e.rule.planted} planted`}
          tip={RECALL}
        />
        <Kpi
          label="Transaction-level precision"
          value={pct(ratio(e.tx.tp, e.tx.flagged))}
          sub={`${e.tx.tp} of ${e.tx.flagged} flagged lines`}
          tip={`${PRECISION} Counted per unique expense line, regardless of which rule fired.`}
        />
        <Kpi
          label="Transaction-level recall"
          value={pct(ratio(e.tx.tp, e.tx.plantedLines))}
          sub={`${e.tx.tp} of ${e.tx.plantedLines} planted lines`}
          tip={`${RECALL} Counted per unique expense line.`}
        />
        <Kpi label="True positives" value={int(e.rule.tp)} sub="Rule-level, line ID + rule match" />
        <Kpi label="False positives" value={int(rFp)} sub="Rule fired with no planted label" />
        <Kpi label="Missed exceptions" value={int(rMiss)} sub="Planted but not detected" />
        <Kpi
          label="Clean lines incorrectly flagged"
          value={int(e.tx.fp)}
          sub="Lines with no planted issue"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Rule-by-rule evaluation" className="xl:col-span-2" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Rule</th>
                  <th className="px-2 py-2 font-medium">Severity</th>
                  {["Planted", "Detected", "TP", "FP", "Missed"].map((h) => (
                    <th key={h} className="px-2 py-2 text-right font-medium">
                      {h}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-0.5">
                      Precision<InfoTip label="precision">{PRECISION}</InfoTip>
                    </span>
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-0.5">
                      Recall<InfoTip label="recall">{RECALL}</InfoTip>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="num">
                {e.perRule.map((r) => (
                  <tr key={r.rule} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">
                      {RULE_BY_ID[r.rule].name}
                      {RULE_BY_ID[r.rule].kind !== "Deterministic" && (
                        <span className="ml-1 text-[10.5px] font-normal text-muted-foreground">
                          (heuristic)
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <SeverityBadge severity={RULE_BY_ID[r.rule].severity} />
                    </td>
                    <td className="px-2 py-2 text-right">{r.planted}</td>
                    <td className="px-2 py-2 text-right">{r.detected}</td>
                    <td className="px-2 py-2 text-right">{r.tp}</td>
                    <td
                      className={`px-2 py-2 text-right ${r.fp ? "text-sev-medium font-semibold" : ""}`}
                    >
                      {r.fp}
                    </td>
                    <td
                      className={`px-2 py-2 text-right ${r.missed ? "text-sev-high font-semibold" : ""}`}
                    >
                      {r.missed}
                    </td>
                    <td className="px-2 py-2 text-right">{pct(ratio(r.tp, r.detected), 0)}</td>
                    <td className="px-4 py-2 text-right">{pct(ratio(r.tp, r.planted), 0)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-secondary/40 font-semibold">
                  <td className="px-4 py-2" colSpan={2}>
                    All rules
                  </td>
                  <td className="px-2 py-2 text-right">{e.rule.planted}</td>
                  <td className="px-2 py-2 text-right">{e.rule.detected}</td>
                  <td className="px-2 py-2 text-right">{e.rule.tp}</td>
                  <td className="px-2 py-2 text-right">{rFp}</td>
                  <td className="px-2 py-2 text-right">{rMiss}</td>
                  <td className="px-2 py-2 text-right">
                    {pct(ratio(e.rule.tp, e.rule.detected), 0)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {pct(ratio(e.rule.tp, e.rule.planted), 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Transaction-level summary">
            <dl className="num space-y-1.5 text-sm">
              {[
                ["Synthetic lines", int(SYNTHETIC_LINES.length)],
                ["Lines with a planted issue", int(e.tx.plantedLines)],
                ["Lines flagged", int(e.tx.flagged)],
                ["Correctly flagged lines", int(e.tx.tp)],
                ["Clean lines flagged", int(e.tx.fp)],
                ["Planted lines missed", int(e.tx.missed)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <section
            className="rounded-lg border-2 border-dashed border-sev-medium/50 bg-sev-medium-soft/50 p-4"
            aria-labelledby="ref-title"
          >
            <h2 id="ref-title" className="flex items-center gap-1.5 text-sm font-semibold">
              <BookMarked className="h-4 w-4" aria-hidden="true" />
              Python engine reference results
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Offline results of the Python engine on its own synthetic dataset, reproduced by
              GitHub Actions CI (run 43370291609, commit b87a901). A different dataset from this
              prototype, so the numbers are not directly comparable.
            </p>
            <dl className="num mt-3 grid grid-cols-2 gap-2 text-sm">
              {[
                ["Synthetic lines", "1,937"],
                ["Planted rule-level exceptions", "109"],
                ["Detected", "99"],
                ["Missed", "10"],
                ["False positives", "4"],
                ["Recall", "≈ 91%"],
                ["Precision", "≈ 96%"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-card/80 px-2.5 py-1.5">
                  <dt className="text-[11px] text-muted-foreground">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      <Panel
        className="mt-4"
        title={
          <span className="flex items-center gap-1.5">
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            Evaluation Methodology
          </span>
        }
      >
        <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-3">
          {[
            [
              "Synthetic planted-answer labels",
              "Each synthetic line carries an optional planted_issue label recording the single rule it was designed to trigger. The detection engine never reads this field; it is used only for scoring.",
            ],
            [
              "Rule-level matching",
              "A detection counts as a true positive only when both the line ID and the rule match a planted label. A correct line flagged by the wrong rule counts as one false positive and one miss.",
            ],
            [
              "Legitimate lookalikes",
              "The dataset includes clean lines that resemble exceptions: shared team lunches with different amounts, recurring subscriptions, and contracted round-rate hotel stays. Some are correctly ignored; some are flagged and show up as false positives.",
            ],
            [
              "Deliberately difficult cases",
              "Some planted issues sit just outside the rules — a near-duplicate 2.6% apart, a cross-employee duplicate in a non-shared category and a missing receipt exactly at the threshold. These are expected misses.",
            ],
            [
              "Why false positives matter",
              "Every false alarm costs reviewer time and erodes trust in the tool. Precision is as important as recall for a control that people must actually use.",
            ],
            [
              "Synthetic accuracy ≠ production accuracy",
              "Results on designed test data show the rules behave as specified. They say little about real-world performance, where patterns, data quality and policy nuance differ. Production use would need validation on real, governed data.",
            ],
          ].map(([t, b]) => (
            <div key={t}>
              <h3 className="mb-1 font-semibold">{t}</h3>
              <p className="text-muted-foreground">{b}</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
