import { describe, expect, it } from "vitest";
import { apiExplanation, currentAiRequest } from "@/lib/ai-review";
import type { ApiAnalysis } from "@/lib/api";
import type { FlaggedLine } from "@/lib/types";
import { DEFAULT_POLICY } from "@/lib/policy-defaults";

const flagged: FlaggedLine = {
  line: {
    line_id: "L9001",
    report_id: "R1",
    employee_id: "E001",
    expense_date: "2026-03-10",
    merchant: "Synthetic Cafe",
    merchant_type: "Restaurant",
    category: "Meals",
    amount_usd: 120,
    receipt_attached: false,
    description: "Gym membership renewal",
  },
  severity: "Medium",
  reason: "Server Claude explanation, not a browser template.",
  findings: [
    {
      rule: "description_mismatch",
      severity: "Medium",
      explanation: "Gym membership does not match Meals.",
      relatedLineIds: [],
    },
  ],
};
const analysis = (used: boolean) => ({ ai: { used, model: "claude-haiku-5-5" } }) as ApiAnalysis;

describe("API AI review", () => {
  it("uses the exact API reason and model when AI was used", () => {
    expect(apiExplanation(flagged, analysis(true))).toMatchObject({
      label: "Live AI (claude-haiku-5-5)",
      reason: flagged.reason,
    });
  });
  it("uses the API rule reason without calling it live AI when AI was not used", () => {
    expect(apiExplanation(flagged, analysis(false))).toMatchObject({
      label: "Rule-based explanation",
      reason: flagged.reason,
    });
  });
  it("preserves description-mismatch explanation text", () => {
    expect(apiExplanation(flagged, analysis(true)).mismatches[0]?.explanation).toBe(
      "Gym membership does not match Meals.",
    );
  });
  it("reruns the uploaded dataset with AI rather than the bundled dataset", () => {
    expect(currentAiRequest("upload", [flagged.line], DEFAULT_POLICY)).toEqual({
      source: "upload",
      lines: [flagged.line],
      policy: DEFAULT_POLICY,
      use_ai: true,
    });
  });
  it("reruns the bundled source with AI without submitting upload lines", () => {
    expect(currentAiRequest("bundled", [flagged.line], DEFAULT_POLICY)).toEqual({
      source: "bundled",
      policy: DEFAULT_POLICY,
      use_ai: true,
    });
  });
});
