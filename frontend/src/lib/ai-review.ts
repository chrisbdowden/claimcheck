import type { ApiAnalysis, AnalyzeRequest } from "./api";
import type { ExpenseLine, FlaggedLine, Policy } from "./types";

export function apiExplanation(line: FlaggedLine, analysis: ApiAnalysis) {
  return {
    label: analysis.ai.used
      ? `Live AI (${analysis.ai.model ?? "Claude"})`
      : "Rule-based explanation",
    reason: line.reason ?? "The API did not return an explanation for this expense.",
    mismatches: line.findings.filter((finding) => finding.rule === "description_mismatch"),
  };
}

export function currentAiRequest(
  source: "bundled" | "upload",
  lines: ExpenseLine[],
  policy: Policy,
): AnalyzeRequest {
  return { source, policy, use_ai: true, ...(source === "upload" ? { lines } : {}) };
}
