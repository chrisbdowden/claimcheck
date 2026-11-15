import { describe, expect, it } from "vitest";
import { REQUIRED, validate, uploadLimitError } from "@/lib/analysis-setup";

describe("synthetic upload validation", () => {
  it("blocks uploads over the server max_lines and allows the boundary", () => {
    expect(uploadLimitError(5000, 5000)).toBeUndefined();
    expect(uploadLimitError(5001, 5000)).toContain("at most 5,000 lines");
    expect(uploadLimitError(3, 2)).toContain("at most 2 lines");
  });

  it("converts receipt strings to booleans before sending parsed lines", () => {
    const text = [
      REQUIRED.join(","),
      ...["true", "yes", "1", "y", "false", "no", "0"].map(
        (receipt, i) => `L${i},R1,E001,2026-03-10,Cafe,Restaurant,Meals,120,${receipt},Dinner`,
      ),
    ].join("\n");
    expect(validate("synthetic.csv", text).parsed.map((l) => l.receipt_attached)).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("keeps existing validation and excludes planted labels from detection input", () => {
    const text = `${REQUIRED.join(",")},planted_issue\nL1,R1,E001,2026-03-10,Cafe,Restaurant,Meals,120,true,Dinner,over_limit\nL1,R1,E001,bad,Cafe,Restaurant,Meals,bad,false,Dinner,over_limit`;
    const v = validate("synthetic.csv", text);
    expect(v.invalidAmounts).toEqual(["L1"]);
    expect(v.badDates).toEqual(["L1"]);
    expect(v.dupIds).toEqual(["L1"]);
    expect(v.parsed).toHaveLength(1);
    expect(v.parsed[0]?.planted_issue).toBeUndefined();
  });
});
