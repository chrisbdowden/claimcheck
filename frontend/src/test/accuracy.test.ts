import { describe, expect, it } from "vitest";
import { accuracyEvaluation } from "@/lib/accuracy";
import type { ApiAnalysis, ApiEvaluation } from "@/lib/api";
import { SYNTHETIC_LINES } from "@/data/synthetic/dataset";
import { runEngine, toFlagged, evaluate } from "@/lib/demo-engine";
import { DEFAULT_POLICY } from "@/lib/policy-defaults";

const evaluation: ApiEvaluation = {
  per_rule: [
    {
      rule: "round_amount",
      label: "Server round amounts",
      planted: 5,
      detected: 4,
      tp: 3,
      fp: 1,
      missed: 2,
      precision: 0.75,
      recall: 0.6,
    },
    {
      rule: "over_limit",
      label: "Server policy limits",
      planted: 8,
      detected: 6,
      tp: 5,
      fp: 1,
      missed: 3,
      precision: null,
      recall: null,
    },
  ],
  rule_totals: {
    rule: "all",
    label: "All rules",
    planted: 13,
    detected: 10,
    tp: 8,
    fp: 2,
    missed: 5,
    precision: 0.79,
    recall: 0.61,
  },
  tx_totals: { lines: 100, planted_lines: 11, flagged: 9, tp: 7, fp: 2, missed: 4 },
};
const analysis = { evaluation } as ApiAnalysis;

describe("accuracy evaluation source", () => {
  it("preserves API scores rather than recalculating precision and recall", () => {
    const result = accuracyEvaluation("python", [], [], analysis);
    expect(result?.rule_totals.precision).toBe(0.79);
    expect(result?.rule_totals.recall).toBe(0.61);
    expect(result?.per_rule[1]?.precision).toBeNull();
  });

  it("preserves returned rule order and server labels", () => {
    expect(accuracyEvaluation("python", [], [], analysis)?.per_rule).toEqual(evaluation.per_rule);
  });

  it("uses transaction totals including clean false positives unchanged", () => {
    expect(accuracyEvaluation("python", [], [], analysis)?.tx_totals).toEqual({
      lines: 100,
      planted_lines: 11,
      flagged: 9,
      tp: 7,
      fp: 2,
      missed: 4,
    });
  });

  it("does not substitute browser evaluation when Python has no evaluation", () => {
    expect(accuracyEvaluation("python", SYNTHETIC_LINES, [], undefined)).toBeUndefined();
    expect(
      accuracyEvaluation("python", SYNTHETIC_LINES, [], { evaluation: null } as ApiAnalysis),
    ).toBeUndefined();
  });

  it("retains browser scoring on fallback even if Python analysis exists", () => {
    const findings = runEngine(SYNTHETIC_LINES, DEFAULT_POLICY);
    const expected = evaluate(SYNTHETIC_LINES, findings);
    const result = accuracyEvaluation(
      "browser",
      SYNTHETIC_LINES,
      toFlagged(SYNTHETIC_LINES, findings),
      analysis,
    );
    expect(result?.rule_totals.tp).toBe(expected.rule.tp);
    expect(result?.rule_totals.precision).toBe(expected.rule.tp / expected.rule.detected);
    expect(result?.tx_totals.fp).toBe(expected.tx.fp);
  });
});
