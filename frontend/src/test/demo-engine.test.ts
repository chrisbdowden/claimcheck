import { describe, expect, it } from "vitest";
import { runEngine } from "@/lib/demo-engine";
import { DEFAULT_POLICY } from "@/lib/policy-defaults";
import { validatePolicy } from "@/lib/policy-validation";
import { SYNTHETIC_LINES } from "@/data/synthetic/dataset";
import type { ExpenseLine } from "@/lib/types";

const base: ExpenseLine = {
  line_id: "L1", report_id: "R1", employee_id: "E1", expense_date: "2026-03-11", merchant: "Harborline Grill",
  merchant_type: "Restaurant", category: "Meals", amount_usd: 42.17, receipt_attached: true, description: "Working lunch",
};
const rules = (lines: ExpenseLine[], id: string) => (runEngine(lines, DEFAULT_POLICY).get(id) ?? []).map((f) => f.rule);

describe("ClaimCheck demo rules", () => {
  it("flags only the second of two exact duplicates", () => {
    const lines = [base, { ...base, line_id: "L2" }];
    expect(rules(lines, "L1")).not.toContain("exact_duplicate");
    expect(rules(lines, "L2")).toContain("exact_duplicate");
  });
  it("near duplicate: within 2% and 3 days flags, 2.6% does not", () => {
    expect(rules([base, { ...base, line_id: "L2", amount_usd: 42.6, expense_date: "2026-03-13" }], "L2")).toContain("near_duplicate");
    expect(rules([base, { ...base, line_id: "L2", amount_usd: 43.27, expense_date: "2026-03-12" }], "L2")).not.toContain("near_duplicate");
  });
  it("cross-employee duplicate applies only to shared categories", () => {
    expect(rules([base, { ...base, line_id: "L2", employee_id: "E2" }], "L2")).toContain("cross_employee_duplicate");
    const hotel = { ...base, category: "Hotel", description: "Hotel stay" };
    expect(rules([hotel, { ...hotel, line_id: "L2", employee_id: "E2" }], "L2")).not.toContain("cross_employee_duplicate");
  });
  it("meals over $100 exceed policy; exactly $100 does not", () => {
    expect(rules([{ ...base, amount_usd: 100.01 }], "L1")).toContain("over_policy_limit");
    expect(rules([{ ...base, amount_usd: 100 }], "L1")).not.toContain("over_policy_limit");
  });
  it("missing receipt only above $75", () => {
    expect(rules([{ ...base, amount_usd: 75.01, receipt_attached: false }], "L1")).toContain("missing_receipt");
    expect(rules([{ ...base, amount_usd: 75, receipt_attached: false }], "L1")).not.toContain("missing_receipt");
  });
  it("split transaction when same-day parts exceed the $200 software limit", () => {
    const sw = { ...base, category: "Software", merchant: "CloudDesk Pro", merchant_type: "Software", description: "Software license" };
    const lines = [{ ...sw, amount_usd: 120.5 }, { ...sw, line_id: "L2", amount_usd: 90.25 }];
    expect(rules(lines, "L1")).toContain("split_transaction");
    expect(rules(lines, "L2")).toContain("split_transaction");
  });
  it("round number at or above $100", () => {
    expect(rules([{ ...base, category: "Hotel", amount_usd: 100, description: "Hotel" }], "L1")).toContain("round_number");
    expect(rules([{ ...base, amount_usd: 99 }], "L1")).not.toContain("round_number");
  });
  it("weekend/holiday for restricted categories only", () => {
    const office = { ...base, category: "Office supplies", description: "Printer paper" };
    expect(rules([{ ...office, expense_date: "2026-03-14" }], "L1")).toContain("weekend_holiday"); // Saturday
    expect(rules([{ ...office, expense_date: "2026-05-25" }], "L1")).toContain("weekend_holiday"); // Memorial Day
    expect(rules([{ ...base, expense_date: "2026-03-14" }], "L1")).not.toContain("weekend_holiday");
  });
  it("blocked merchant types: casino is blocked", () => {
    expect(rules([{ ...base, merchant_type: "Casino" }], "L1")).toContain("blocked_category");
  });
  it("never reads planted_issue", () => {
    const stripped = SYNTHETIC_LINES.map(({ planted_issue: _p, ...l }) => l as ExpenseLine);
    expect(runEngine(stripped, DEFAULT_POLICY).size).toBe(runEngine(SYNTHETIC_LINES, DEFAULT_POLICY).size);
  });
  it("dataset has 1,937 lines and 109 planted rule-level exceptions", () => {
    expect(SYNTHETIC_LINES.length).toBe(1937);
    expect(SYNTHETIC_LINES.filter((l) => l.planted_issue).length).toBe(109);
  });
  it("rejects negative policy thresholds", () => {
    expect(validatePolicy({ receipt: "-5" })["receipt"]).toBeDefined();
    expect(validatePolicy({ receipt: "75" })["receipt"]).toBeUndefined();
  });
});
