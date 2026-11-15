import type { ApiAnalysis, ApiEvaluation } from "./api";
import { evaluate } from "./demo-engine";
import { RULE_BY_ID } from "./rules";
import type { ExpenseLine, FlaggedLine } from "./types";

const ratio = (a: number, b: number) => (b ? a / b : 0);

/** Python scores are authoritative; browser scoring runs only for the fallback. */
export function accuracyEvaluation(
  engine: "python" | "browser",
  lines: ExpenseLine[],
  flagged: FlaggedLine[],
  analysis: ApiAnalysis | undefined,
): ApiEvaluation | undefined {
  if (engine === "python") return analysis?.evaluation ?? undefined;
  const e = evaluate(lines, new Map(flagged.map((f) => [f.line.line_id, f.findings])));
  return {
    per_rule: e.perRule.map((row) => ({
      ...row,
      label: RULE_BY_ID[row.rule].name,
      precision: ratio(row.tp, row.detected),
      recall: ratio(row.tp, row.planted),
    })),
    rule_totals: {
      ...e.rule,
      rule: "all",
      label: "All rules",
      fp: e.rule.detected - e.rule.tp,
      missed: e.rule.planted - e.rule.tp,
      precision: ratio(e.rule.tp, e.rule.detected),
      recall: ratio(e.rule.tp, e.rule.planted),
    },
    tx_totals: { ...e.tx, lines: lines.length, planted_lines: e.tx.plantedLines },
  };
}
