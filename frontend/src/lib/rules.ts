import type { RuleId, Severity } from "./types";

export interface RuleMeta {
  id: RuleId;
  name: string;
  severity: Severity;
  kind: "Deterministic" | "AI-assisted / offline heuristic";
  purpose: string;
  conditions: string;
  dependencies: string;
  example: string;
}

export const RULES: RuleMeta[] = [
  { id: "exact_duplicate", name: "Exact duplicate", severity: "High", kind: "Deterministic",
    purpose: "Catch the same expense being claimed more than once.",
    conditions: "Same employee, merchant, date, and amount. The first line is treated as the original; subsequent matching lines are flagged.",
    dependencies: "None", example: "Two $86.40 lines at Harborline Grill, same employee, same day." },
  { id: "near_duplicate", name: "Near duplicate", severity: "High", kind: "Deterministic",
    purpose: "Catch re-submissions with slightly altered amounts or dates.",
    conditions: "Same employee and merchant, unequal amounts within 2%, dates within three days.",
    dependencies: "None", example: "$412.00 and $416.12 at Harborview Suites two days apart." },
  { id: "cross_employee_duplicate", name: "Cross-employee duplicate", severity: "Medium", kind: "Deterministic",
    purpose: "Detect a shared bill claimed in full by more than one employee.",
    conditions: "Same merchant, date, and amount across different employees, restricted to shared-expense categories.",
    dependencies: "Shared-expense categories", example: "Two employees each claim a $214.60 client dinner." },
  { id: "over_policy_limit", name: "Over policy limit", severity: "Medium", kind: "Deterministic",
    purpose: "Enforce per-category spending limits.",
    conditions: "Amount exceeds the configured category threshold.",
    dependencies: "Category limits", example: "$142.80 meal against a $100 meals limit." },
  { id: "missing_receipt", name: "Missing receipt", severity: "Medium", kind: "Deterministic",
    purpose: "Ensure documentation exists for material expenses.",
    conditions: "Amount exceeds the receipt threshold and no receipt is attached.",
    dependencies: "Receipt threshold", example: "$96.10 ground transport with no receipt." },
  { id: "split_transaction", name: "Split transaction", severity: "High", kind: "Deterministic",
    purpose: "Detect purchases broken up to stay below a limit.",
    conditions: "Two or more same-day, same-category lines by one employee, each within the limit, whose combined value exceeds the limit. Lines already flagged as duplicates are excluded.",
    dependencies: "Category limits", example: "$128.40 + $119.90 software purchases on one day vs. $200 limit." },
  { id: "round_number", name: "Round-number amount", severity: "Low", kind: "Deterministic",
    purpose: "Highlight estimated or fabricated amounts for a closer look.",
    conditions: "Whole-dollar amount at or above the round-number threshold.",
    dependencies: "Round-number threshold", example: "$300.00 hotel charge." },
  { id: "weekend_holiday", name: "Weekend / holiday", severity: "Low", kind: "Deterministic",
    purpose: "Question business-only spend on non-working days.",
    conditions: "Restricted category on a Saturday, Sunday, or configured holiday.",
    dependencies: "Weekend-restricted categories, holiday calendar", example: "Office supplies bought on a Sunday." },
  { id: "blocked_category", name: "Blocked category", severity: "High", kind: "Deterministic",
    purpose: "Stop prohibited merchant types from being reimbursed unnoticed.",
    conditions: "Merchant type matches a blocked category.",
    dependencies: "Blocked merchant types", example: "$145.37 at Lucky Seven Casino." },
  { id: "description_mismatch", name: "Description mismatch", severity: "Medium", kind: "AI-assisted / offline heuristic",
    purpose: "Spot descriptions that don't fit the merchant or category.",
    conditions: "Description vocabulary points to a different category than the one claimed. In this prototype an offline keyword heuristic is used; no AI model is called.",
    dependencies: "Category vocabulary (offline), optional AI provider (simulated)", example: "\"Wireless keyboard\" claimed as Meals at Harborline Grill." },
];

export const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r])) as Record<RuleId, RuleMeta>;
export const SEVERITY_RANK: Record<Severity, number> = { High: 3, Medium: 2, Low: 1 };
