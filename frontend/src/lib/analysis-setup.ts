import { parseCsv } from "./csv";
import type { ExpenseLine } from "./types";

export const REQUIRED = [
  "line_id",
  "report_id",
  "employee_id",
  "expense_date",
  "merchant",
  "merchant_type",
  "category",
  "amount_usd",
  "receipt_attached",
  "description",
] as const;
export interface Validation {
  filename: string;
  rows: number;
  missing: string[];
  invalidAmounts: string[];
  dupIds: string[];
  badDates: string[];
  parsed: ExpenseLine[];
  fatal?: string;
}

export function validate(filename: string, text: string): Validation {
  const rows = parseCsv(text);
  if (rows.length === 0)
    return {
      filename,
      rows: 0,
      missing: [...REQUIRED],
      invalidAmounts: [],
      dupIds: [],
      badDates: [],
      parsed: [],
      fatal: "The file is empty.",
    };
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((r) => !header.includes(r));
  const idx = (k: string) => header.indexOf(k);
  const invalidAmounts: string[] = [],
    dupIds: string[] = [],
    badDates: string[] = [];
  const seen = new Set<string>();
  const parsed: ExpenseLine[] = [];
  rows.slice(1).forEach((r, i) => {
    const get = (k: string) => (idx(k) >= 0 ? (r[idx(k)] ?? "").trim() : "");
    const id = get("line_id") || `row ${i + 2}`;
    const amt = Number(get("amount_usd"));
    const date = get("expense_date");
    const okAmt = get("amount_usd") !== "" && Number.isFinite(amt) && amt >= 0;
    const okDate =
      /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + "T00:00:00Z"));
    if (!okAmt) invalidAmounts.push(id);
    if (!okDate) badDates.push(id);
    if (seen.has(id)) dupIds.push(id);
    seen.add(id);
    if (okAmt && okDate && missing.length === 0)
      parsed.push({
        line_id: id,
        report_id: get("report_id"),
        employee_id: get("employee_id"),
        expense_date: date,
        merchant: get("merchant"),
        merchant_type: get("merchant_type"),
        category: get("category"),
        amount_usd: amt,
        receipt_attached: ["true", "yes", "1", "y"].includes(get("receipt_attached").toLowerCase()),
        description: get("description"),
        // planted_issue is intentionally ignored as a detection input
      });
  });
  return { filename, rows: rows.length - 1, missing, invalidAmounts, dupIds, badDates, parsed };
}

export function uploadLimitError(rows: number, maxLines: number | undefined): string | undefined {
  return maxLines !== undefined && rows > maxLines
    ? `This CSV has ${rows.toLocaleString("en-US")} lines. The Python engine allows at most ${maxLines.toLocaleString("en-US")} lines per upload.`
    : undefined;
}
