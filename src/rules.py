"""Rule engine: deterministic expense exception checks.

Each rule returns a list of hits: {"line_id", "rule", "detail"}. Rules never
look at the planted_issue column (that is the answer key used only by
evaluate.py).

Row order is treated as submission order: when two lines duplicate each
other, the earlier row is the original and the later row is flagged.
"""
from __future__ import annotations

from itertools import combinations

import pandas as pd

from .policy import Policy

EXACT_DUPLICATE = "exact_duplicate"
NEAR_DUPLICATE = "near_duplicate"
CROSS_EMPLOYEE_DUPLICATE = "cross_employee_duplicate"
OVER_LIMIT = "over_limit"
MISSING_RECEIPT = "missing_receipt"
SPLIT_TRANSACTION = "split_transaction"
ROUND_AMOUNT = "round_amount"
WEEKEND_HOLIDAY = "weekend_holiday"
BLOCKED_CATEGORY = "blocked_category"
DESCRIPTION_MISMATCH = "description_mismatch"  # produced by ai_review.py

RULE_ORDER = [
    EXACT_DUPLICATE,
    NEAR_DUPLICATE,
    CROSS_EMPLOYEE_DUPLICATE,
    OVER_LIMIT,
    MISSING_RECEIPT,
    SPLIT_TRANSACTION,
    ROUND_AMOUNT,
    WEEKEND_HOLIDAY,
    BLOCKED_CATEGORY,
    DESCRIPTION_MISMATCH,
]

RULE_LABELS = {
    EXACT_DUPLICATE: "Exact duplicate",
    NEAR_DUPLICATE: "Near duplicate",
    CROSS_EMPLOYEE_DUPLICATE: "Cross-employee duplicate",
    OVER_LIMIT: "Over policy limit",
    MISSING_RECEIPT: "Missing receipt",
    SPLIT_TRANSACTION: "Split transaction",
    ROUND_AMOUNT: "Round-number amount",
    WEEKEND_HOLIDAY: "Weekend / holiday",
    BLOCKED_CATEGORY: "Blocked category",
    DESCRIPTION_MISMATCH: "Description mismatch",
}

SEVERITY = {
    EXACT_DUPLICATE: "High",
    NEAR_DUPLICATE: "High",
    SPLIT_TRANSACTION: "High",
    BLOCKED_CATEGORY: "High",
    CROSS_EMPLOYEE_DUPLICATE: "Medium",
    OVER_LIMIT: "Medium",
    MISSING_RECEIPT: "Medium",
    DESCRIPTION_MISMATCH: "Medium",
    ROUND_AMOUNT: "Low",
    WEEKEND_HOLIDAY: "Low",
}
SEVERITY_RANK = {"High": 3, "Medium": 2, "Low": 1}

NEAR_DUP_AMOUNT_TOLERANCE = 0.02  # 2%
NEAR_DUP_DAY_WINDOW = 3

REQUIRED_COLUMNS = [
    "line_id",
    "report_id",
    "employee_id",
    "expense_date",
    "merchant",
    "category",
    "amount_usd",
    "receipt_attached",
    "description",
]


def money(x: float) -> str:
    return f"${x:,.2f}"


def prepare(df: pd.DataFrame) -> pd.DataFrame:
    """Validate and normalise an expense export."""
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    out = df.copy()
    out["line_id"] = out["line_id"].astype(str)
    if out["line_id"].duplicated().any():
        raise ValueError("line_id values must be unique")
    out["expense_date"] = pd.to_datetime(out["expense_date"])
    out["amount_usd"] = pd.to_numeric(out["amount_usd"]).round(2)
    out["receipt_attached"] = out["receipt_attached"].astype(str).str.strip().str.upper().isin(["Y", "YES", "TRUE", "1"])
    if "merchant_type" not in out.columns:
        out["merchant_type"] = ""
    out["merchant_type"] = out["merchant_type"].fillna("").astype(str)
    out["description"] = out["description"].fillna("").astype(str)
    out["_seq"] = range(len(out))
    return out


def _hit(line_id: str, rule: str, detail: str) -> dict:
    return {"line_id": line_id, "rule": rule, "detail": detail}


# ---------------------------------------------------------------- duplicates

def exact_duplicates(df: pd.DataFrame, policy: Policy) -> list[dict]:
    hits = []
    keys = ["employee_id", "merchant", "expense_date", "amount_usd"]
    for _, g in df.groupby(keys, sort=False):
        if len(g) < 2:
            continue
        g = g.sort_values("_seq")
        first = g.iloc[0]
        for row in g.iloc[1:].itertuples():
            hits.append(_hit(
                row.line_id, EXACT_DUPLICATE,
                f"Same {money(row.amount_usd)} at {row.merchant} on {row.expense_date:%Y-%m-%d} "
                f"already claimed on line {first.line_id} (report {first.report_id}).",
            ))
    return hits


def near_duplicates(df: pd.DataFrame, policy: Policy) -> list[dict]:
    hits, flagged = [], set()
    for _, g in df.groupby(["employee_id", "merchant"], sort=False):
        if len(g) < 2:
            continue
        rows = list(g.sort_values("_seq").itertuples())
        for a, b in combinations(rows, 2):  # a is earlier than b
            if b.line_id in flagged or a.amount_usd == b.amount_usd:
                continue
            days = abs((b.expense_date - a.expense_date).days)
            diff = abs(a.amount_usd - b.amount_usd) / max(a.amount_usd, b.amount_usd)
            if days <= NEAR_DUP_DAY_WINDOW and diff <= NEAR_DUP_AMOUNT_TOLERANCE:
                flagged.add(b.line_id)
                hits.append(_hit(
                    b.line_id, NEAR_DUPLICATE,
                    f"{money(b.amount_usd)} at {b.merchant} is within {diff:.1%} of "
                    f"{money(a.amount_usd)} claimed {days} day(s) apart on line {a.line_id}.",
                ))
    return hits


def cross_employee_duplicates(df: pd.DataFrame, policy: Policy) -> list[dict]:
    hits = []
    shared = df[df["category"].isin(policy.shared_expense_categories)]
    for _, g in shared.groupby(["merchant", "expense_date", "amount_usd"], sort=False):
        if g["employee_id"].nunique() < 2:
            continue
        g = g.sort_values("_seq")
        first = g.iloc[0]
        for row in g.iloc[1:].itertuples():
            if row.employee_id == first.employee_id:
                continue  # same-employee repeats are handled by exact_duplicates
            hits.append(_hit(
                row.line_id, CROSS_EMPLOYEE_DUPLICATE,
                f"{row.employee_id} claimed the same {money(row.amount_usd)} {row.merchant} charge "
                f"on {row.expense_date:%Y-%m-%d} that {first.employee_id} claimed on line {first.line_id}.",
            ))
    return hits


# ---------------------------------------------------------------- policy

def over_limit(df: pd.DataFrame, policy: Policy) -> list[dict]:
    hits = []
    for row in df.itertuples():
        limit = policy.category_limits.get(row.category)
        if limit is not None and row.amount_usd > limit:
            hits.append(_hit(
                row.line_id, OVER_LIMIT,
                f"{money(row.amount_usd)} is over the {row.category} limit of {money(limit)} "
                f"by {money(row.amount_usd - limit)}.",
            ))
    return hits


def missing_receipts(df: pd.DataFrame, policy: Policy) -> list[dict]:
    hits = []
    for row in df.itertuples():
        if row.amount_usd > policy.receipt_threshold and not row.receipt_attached:
            hits.append(_hit(
                row.line_id, MISSING_RECEIPT,
                f"No receipt for {money(row.amount_usd)}; receipts are required above "
                f"{money(policy.receipt_threshold)}.",
            ))
    return hits


def split_transactions(df: pd.DataFrame, policy: Policy, exclude: set[str] | None = None) -> list[dict]:
    """2+ lines, same employee/merchant/day, each under the limit but together over it.

    Lines already flagged as exact or near duplicates are excluded so a single
    double claim is not also reported as a split.
    """
    hits = []
    exclude = exclude or set()
    pool = df[~df["line_id"].isin(exclude)]
    for (emp, merchant, day), g in pool.groupby(["employee_id", "merchant", "expense_date"], sort=False):
        if len(g) < 2:
            continue
        limit = policy.category_limits.get(g["category"].iloc[0])
        if limit is None:
            continue
        total = g["amount_usd"].sum()
        if (g["amount_usd"] <= limit).all() and total > limit and g["amount_usd"].nunique() > 1:
            ids = ", ".join(g.sort_values("_seq")["line_id"])
            for row in g.itertuples():
                hits.append(_hit(
                    row.line_id, SPLIT_TRANSACTION,
                    f"{len(g)} {merchant} charges on {day:%Y-%m-%d} ({ids}) total {money(total)}, "
                    f"over the {money(limit)} limit, though each is under it.",
                ))
    return hits


def round_amounts(df: pd.DataFrame, policy: Policy) -> list[dict]:
    hits = []
    for row in df.itertuples():
        cents = round(row.amount_usd * 100) % 100
        if row.amount_usd >= policy.round_amount_threshold and cents == 0:
            hits.append(_hit(
                row.line_id, ROUND_AMOUNT,
                f"Whole-dollar amount of {money(row.amount_usd)}; round numbers can indicate an estimate rather than a receipt.",
            ))
    return hits


def weekend_holiday(df: pd.DataFrame, policy: Policy) -> list[dict]:
    hits = []
    for row in df.itertuples():
        if row.category not in policy.weekend_restricted_categories:
            continue
        if row.expense_date in policy.holidays:
            when = "a company holiday"
        elif row.expense_date.weekday() >= 5:
            when = "a " + row.expense_date.strftime("%A")
        else:
            continue
        hits.append(_hit(
            row.line_id, WEEKEND_HOLIDAY,
            f"{row.category} spend of {money(row.amount_usd)} on {row.expense_date:%Y-%m-%d}, {when}.",
        ))
    return hits


def blocked_categories(df: pd.DataFrame, policy: Policy) -> list[dict]:
    hits = []
    for row in df.itertuples():
        if row.merchant_type in policy.blocked_merchant_types:
            hits.append(_hit(
                row.line_id, BLOCKED_CATEGORY,
                f"{row.merchant} is a {row.merchant_type.lower()} merchant, which policy does not reimburse.",
            ))
    return hits


# ---------------------------------------------------------------- combine

def run_rules(df: pd.DataFrame, policy: Policy) -> list[dict]:
    """Run rules 1-9. df must already be prepare()d."""
    hits = exact_duplicates(df, policy) + near_duplicates(df, policy)
    dup_ids = {h["line_id"] for h in hits}
    hits += cross_employee_duplicates(df, policy)
    hits += over_limit(df, policy)
    hits += missing_receipts(df, policy)
    hits += split_transactions(df, policy, exclude=dup_ids)
    hits += round_amounts(df, policy)
    hits += weekend_holiday(df, policy)
    hits += blocked_categories(df, policy)
    return hits


def build_exceptions(df: pd.DataFrame, hits: list[dict]) -> pd.DataFrame:
    """One row per flagged line, sorted by severity then amount."""
    cols = ["line_id", "report_id", "employee_id", "expense_date", "merchant", "category",
            "amount_usd", "receipt_attached", "description", "rule_codes", "rules", "severity", "details"]
    if not hits:
        return pd.DataFrame(columns=cols)
    h = pd.DataFrame(hits)
    order = {r: i for i, r in enumerate(RULE_ORDER)}
    h["_o"] = h["rule"].map(order)
    h = h.sort_values(["line_id", "_o"]).drop_duplicates(["line_id", "rule"])
    agg = h.groupby("line_id").agg(
        rule_codes=("rule", "|".join),
        details=("detail", " ".join),
    ).reset_index()
    agg["rules"] = agg["rule_codes"].apply(lambda s: ", ".join(RULE_LABELS[r] for r in s.split("|")))
    agg["severity"] = agg["rule_codes"].apply(
        lambda s: max((SEVERITY[r] for r in s.split("|")), key=SEVERITY_RANK.get)
    )
    out = df.merge(agg, on="line_id")
    out["_rank"] = out["severity"].map(SEVERITY_RANK)
    out = out.sort_values(["_rank", "amount_usd"], ascending=[False, False])
    return out[cols].reset_index(drop=True)


def for_export(exceptions: pd.DataFrame) -> pd.DataFrame:
    """Exception queue formatted for CSV: ISO dates, Y/N receipts."""
    out = exceptions.copy()
    out["expense_date"] = pd.to_datetime(out["expense_date"]).dt.strftime("%Y-%m-%d")
    out["receipt_attached"] = out["receipt_attached"].map({True: "Y", False: "N"})
    return out
