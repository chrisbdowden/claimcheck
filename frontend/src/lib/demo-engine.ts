/**
 * Frontend demonstration ruleset. This is NOT the production Python engine.
 * It re-implements the ten documented rules in the browser so the prototype's
 * numbers reconcile. It never reads `planted_issue`.
 */
import type { ExpenseLine, Finding, FlaggedLine, Policy, RuleId, Severity } from "./types";
import { RULE_BY_ID, SEVERITY_RANK } from "./rules";

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const dayNum = (s: string) => Date.parse(s + "T00:00:00Z") / 86400000;
const dow = (s: string) => new Date(s + "T00:00:00Z").getUTCDay();

export const CATEGORY_VOCAB: Record<string, string[]> = {
  Airfare: ["flight", "airfare", "airline", "baggage", "seat"],
  Hotel: ["hotel", "lodging", "room", "night"],
  Meals: ["lunch", "dinner", "breakfast", "meal", "coffee"],
  "Ground transport": ["taxi", "car service", "ride", "parking", "mileage"],
  "Client entertainment": ["client", "hosting", "hospitality", "tickets", "dinner", "lunch"],
  Software: ["software", "subscription", "license", "plugin"],
  "Office supplies": ["paper", "toner", "pens", "notebooks", "supplies", "binders", "keyboard", "mouse", "printer"],
  "Conference fees": ["conference", "summit", "registration", "workshop", "pass"],
};

export function mismatchCheck(line: ExpenseLine): string | null {
  const d = line.description.toLowerCase();
  const own = CATEGORY_VOCAB[line.category] ?? [];
  if (own.some((k) => d.includes(k))) return null;
  for (const [cat, words] of Object.entries(CATEGORY_VOCAB)) {
    if (cat === line.category) continue;
    const hit = words.find((k) => d.includes(k));
    if (hit) return cat;
  }
  return null;
}

export function runEngine(lines: ExpenseLine[], policy: Policy): Map<string, Finding[]> {
  const out = new Map<string, Finding[]>();
  const add = (id: string, rule: RuleId, explanation: string, related: string[] = []) => {
    const arr = out.get(id) ?? [];
    arr.push({ rule, severity: RULE_BY_ID[rule].severity, explanation, relatedLineIds: related });
    out.set(id, arr);
  };
  const byId = [...lines].sort((a, b) => a.line_id.localeCompare(b.line_id));
  const holidays = new Map(policy.holidays.map((h) => [h.date, h.name]));
  const dupIds = new Set<string>();

  // 1. Exact duplicate
  const exact = new Map<string, ExpenseLine>();
  for (const l of byId) {
    const k = `${l.employee_id}|${l.merchant}|${l.expense_date}|${l.amount_usd.toFixed(2)}`;
    const first = exact.get(k);
    if (first) {
      dupIds.add(l.line_id);
      add(l.line_id, "exact_duplicate", `A second ${fmt(l.amount_usd)} expense at ${l.merchant} was submitted by the same employee on the same date as ${first.line_id}. A duplicate match requires human review before any conclusion.`, [first.line_id]);
    } else exact.set(k, l);
  }
  // 2. Near duplicate
  const byEmpMerchant = new Map<string, ExpenseLine[]>();
  for (const l of byId) {
    const k = `${l.employee_id}|${l.merchant}`;
    (byEmpMerchant.get(k) ?? byEmpMerchant.set(k, []).get(k)!).push(l);
  }
  for (const group of byEmpMerchant.values()) {
    for (let i = 0; i < group.length; i++) for (let j = 0; j < i; j++) {
      const a = group[j]!, b = group[i]!;
      if (a.amount_usd === b.amount_usd) continue;
      const diff = Math.abs(a.amount_usd - b.amount_usd) / Math.max(a.amount_usd, b.amount_usd);
      if (diff <= 0.02 && Math.abs(dayNum(a.expense_date) - dayNum(b.expense_date)) <= 3) {
        dupIds.add(b.line_id);
        add(b.line_id, "near_duplicate", `${fmt(b.amount_usd)} at ${b.merchant} is within ${(diff * 100).toFixed(1)}% of ${a.line_id} (${fmt(a.amount_usd)}) submitted by the same employee ${Math.abs(dayNum(a.expense_date) - dayNum(b.expense_date))} day(s) apart.`, [a.line_id]);
        break;
      }
    }
  }
  // 3. Cross-employee duplicate
  const shared = new Set(policy.sharedExpenseCategories);
  const cross = new Map<string, ExpenseLine>();
  for (const l of byId) {
    if (!shared.has(l.category)) continue;
    const k = `${l.merchant}|${l.expense_date}|${l.amount_usd.toFixed(2)}`;
    const first = cross.get(k);
    if (first && first.employee_id !== l.employee_id) {
      add(l.line_id, "cross_employee_duplicate", `${first.employee_id} claimed the same ${fmt(l.amount_usd)} at ${l.merchant} on ${l.expense_date} (${first.line_id}). This may be a shared bill claimed twice, or a legitimate split that needs confirming.`, [first.line_id]);
    } else if (!first) cross.set(k, l);
  }
  for (const l of byId) {
    const lim = policy.categoryLimits[l.category];
    // 4. Over policy limit
    if (lim != null && l.amount_usd > lim) add(l.line_id, "over_policy_limit", `${fmt(l.amount_usd)} exceeds the ${l.category} limit of ${fmt(lim)} by ${fmt(l.amount_usd - lim)}.`);
    // 5. Missing receipt
    if (l.amount_usd > policy.receiptThreshold && !l.receipt_attached) add(l.line_id, "missing_receipt", `${fmt(l.amount_usd)} is above the ${fmt(policy.receiptThreshold)} receipt threshold and no receipt is attached.`);
    // 7. Round number
    if (Number.isInteger(l.amount_usd) && l.amount_usd >= policy.roundNumberThreshold) add(l.line_id, "round_number", `${fmt(l.amount_usd)} is a whole-dollar amount at or above the ${fmt(policy.roundNumberThreshold)} threshold. Round amounts can indicate estimates; many are legitimate fixed fees.`);
    // 8. Weekend / holiday
    if (policy.weekendRestrictedCategories.includes(l.category)) {
      const d = dow(l.expense_date);
      const hol = holidays.get(l.expense_date);
      if (d === 0 || d === 6 || hol) add(l.line_id, "weekend_holiday", `${l.category} expense dated ${l.expense_date} (${hol ?? (d === 0 ? "Sunday" : "Saturday")}). This category is restricted on weekends and holidays.`);
    }
    // 9. Blocked category
    if (policy.blockedMerchantTypes.some((t) => t.toLowerCase() === l.merchant_type.toLowerCase())) add(l.line_id, "blocked_category", `${l.merchant} is classified as "${l.merchant_type}", a blocked merchant type under current policy.`);
    // 10. Description mismatch (offline heuristic)
    const mm = mismatchCheck(l);
    if (mm) add(l.line_id, "description_mismatch", `The description "${l.description}" reads like ${mm}, not ${l.category} at ${l.merchant}. Offline keyword heuristic — verify with the employee.`);
  }
  // 6. Split transaction
  const splits = new Map<string, ExpenseLine[]>();
  for (const l of byId) {
    if (dupIds.has(l.line_id)) continue;
    const k = `${l.employee_id}|${l.expense_date}|${l.category}`;
    (splits.get(k) ?? splits.set(k, []).get(k)!).push(l);
  }
  for (const g of splits.values()) {
    if (g.length < 2) continue;
    const lim = policy.categoryLimits[g[0]!.category];
    if (lim == null) continue;
    const q = g.filter((l) => l.amount_usd <= lim);
    const sum = q.reduce((s, l) => s + l.amount_usd, 0);
    if (q.length >= 2 && sum > lim) for (const l of q) add(l.line_id, "split_transaction", `${q.length} same-day ${l.category} expenses total ${fmt(sum)}, above the ${fmt(lim)} limit, though each is individually within it.`, q.filter((x) => x !== l).map((x) => x.line_id));
  }
  return out;
}

export function maxSeverity(f: Finding[]): Severity {
  return f.reduce<Severity>((m, x) => (SEVERITY_RANK[x.severity] > SEVERITY_RANK[m] ? x.severity : m), "Low");
}

export function toFlagged(lines: ExpenseLine[], findings: Map<string, Finding[]>): FlaggedLine[] {
  return lines.filter((l) => findings.has(l.line_id)).map((l) => {
    const f = findings.get(l.line_id)!;
    return { line: l, findings: f, severity: maxSeverity(f) };
  });
}

export interface RuleEval { rule: RuleId; planted: number; detected: number; tp: number; fp: number; missed: number }

/** Evaluation against synthetic planted labels: rule-level matching by line_id + rule. */
export function evaluate(lines: ExpenseLine[], findings: Map<string, Finding[]>) {
  const planted = new Set(lines.filter((l) => l.planted_issue).map((l) => `${l.line_id}|${l.planted_issue}`));
  const detected = new Set<string>();
  for (const [id, fs] of findings) for (const f of fs) detected.add(`${id}|${f.rule}`);
  const rules = Object.keys(RULE_BY_ID) as RuleId[];
  const perRule: RuleEval[] = rules.map((rule) => {
    const p = [...planted].filter((k) => k.endsWith("|" + rule));
    const d = [...detected].filter((k) => k.endsWith("|" + rule));
    const tp = d.filter((k) => planted.has(k)).length;
    return { rule, planted: p.length, detected: d.length, tp, fp: d.length - tp, missed: p.length - tp };
  });
  const plantedLines = new Set(lines.filter((l) => l.planted_issue).map((l) => l.line_id));
  const flaggedLines = new Set(findings.keys());
  const txTp = [...flaggedLines].filter((id) => plantedLines.has(id)).length;
  return {
    perRule,
    rule: { planted: planted.size, detected: detected.size, tp: perRule.reduce((s, r) => s + r.tp, 0) },
    tx: { plantedLines: plantedLines.size, flagged: flaggedLines.size, tp: txTp, fp: flaggedLines.size - txTp, missed: plantedLines.size - txTp },
  };
}
