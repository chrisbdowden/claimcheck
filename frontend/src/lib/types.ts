export type Severity = "High" | "Medium" | "Low";
export type ReviewStatus = "New" | "In Review" | "Cleared" | "Escalated";

export type RuleId =
  | "exact_duplicate"
  | "near_duplicate"
  | "cross_employee_duplicate"
  | "over_limit"
  | "missing_receipt"
  | "split_transaction"
  | "round_amount"
  | "weekend_holiday"
  | "blocked_category"
  | "description_mismatch";

export type Category =
  | "Airfare"
  | "Hotel"
  | "Meals"
  | "Ground transport"
  | "Client entertainment"
  | "Software"
  | "Office supplies"
  | "Conference fees";

export interface ExpenseLine {
  line_id: string;
  report_id: string;
  employee_id: string;
  expense_date: string; // YYYY-MM-DD
  merchant: string;
  merchant_type: string;
  category: Category | string;
  amount_usd: number;
  receipt_attached: boolean;
  description: string;
  /** Evaluation label only. Never read by the detection engine. */
  planted_issue?: RuleId | "";
}

export interface Employee {
  id: string;
  name: string;
  department: string;
}

export interface Policy {
  categoryLimits: Record<string, number>;
  receiptThreshold: number;
  roundNumberThreshold: number;
  blockedMerchantTypes: string[];
  weekendRestrictedCategories: string[];
  sharedExpenseCategories: string[];
  holidays: { date: string; name: string }[];
}

export interface Finding {
  rule: RuleId;
  severity: Severity;
  explanation: string;
  relatedLineIds: string[];
}

export interface FlaggedLine {
  line: ExpenseLine;
  findings: Finding[];
  severity: Severity;
}

export interface HistoryEvent {
  id: string;
  timestamp: string;
  user: string;
  type:
    | "Status change"
    | "Note added"
    | "Policy change"
    | "Analysis run"
    | "Export"
    | "Settings change";
  lineId?: string | undefined;
  previousStatus?: ReviewStatus | undefined;
  newStatus?: ReviewStatus | undefined;
  note?: string | undefined;
}
