"""Small hand-made cases for each rule.  Run: python -m pytest -q"""
import pandas as pd
import pytest

from src import rules
from src.ai_review import heuristic_mismatches
from src.policy import Policy, default_policy

POLICY = default_policy()


def make(*rows):
    base = {"report_id": "R1", "employee_id": "E1", "expense_date": "2026-03-04", "merchant": "Harborline Grill",
            "merchant_type": "Restaurant", "category": "Meals", "amount_usd": 42.17, "receipt_attached": "Y",
            "description": "Lunch during audit fieldwork"}
    data = [{**base, "line_id": f"L{i + 1}", **r} for i, r in enumerate(rows)]
    return rules.prepare(pd.DataFrame(data))


def flagged(hits, rule=None):
    return sorted(h["line_id"] for h in hits if rule is None or h["rule"] == rule)


def test_exact_duplicate_flags_later_line_only():
    df = make({}, {}, {"amount_usd": 42.18})
    assert flagged(rules.exact_duplicates(df, POLICY)) == ["L2"]


def test_near_duplicate_within_tolerance_and_window():
    df = make({"amount_usd": 50.00 + 0.01}, {"amount_usd": 50.80, "expense_date": "2026-03-06"})
    assert flagged(rules.near_duplicates(df, POLICY)) == ["L2"]


def test_near_duplicate_ignores_outside_window_or_tolerance():
    df = make({"amount_usd": 50.01},
              {"amount_usd": 50.40, "expense_date": "2026-03-09"},   # 5 days later
              {"amount_usd": 53.90, "expense_date": "2026-03-05"})   # ~7% apart
    assert flagged(rules.near_duplicates(df, POLICY)) == []


def test_cross_employee_duplicate_only_for_shared_categories():
    df = make({}, {"employee_id": "E2"},
              {"category": "Hotel", "merchant": "The Linden Hotel", "amount_usd": 219.45},
              {"category": "Hotel", "merchant": "The Linden Hotel", "amount_usd": 219.45, "employee_id": "E2"})
    assert flagged(rules.cross_employee_duplicates(df, POLICY)) == ["L2"]


def test_over_limit():
    df = make({"amount_usd": 100.00}, {"amount_usd": 100.01})
    assert flagged(rules.over_limit(df, POLICY)) == ["L2"]


def test_missing_receipt_above_threshold():
    df = make({"amount_usd": 75.00, "receipt_attached": "N"}, {"amount_usd": 75.01, "receipt_attached": "N"},
              {"amount_usd": 90.13, "receipt_attached": "Y"})
    assert flagged(rules.missing_receipts(df, POLICY)) == ["L2"]


def test_split_transaction_same_day():
    df = make({"amount_usd": 61.20}, {"amount_usd": 58.75}, {"amount_usd": 30.10, "merchant": "Blue Fern Cafe"})
    assert flagged(rules.split_transactions(df, POLICY)) == ["L1", "L2"]


def test_split_ignores_lines_already_flagged_as_duplicates():
    df = make({"amount_usd": 61.20}, {"amount_usd": 61.20})
    dup = {h["line_id"] for h in rules.exact_duplicates(df, POLICY)}
    assert flagged(rules.split_transactions(df, POLICY, exclude=dup)) == []


def test_round_amount():
    df = make({"amount_usd": 99.00, "category": "Hotel"}, {"amount_usd": 150.00, "category": "Hotel"},
              {"amount_usd": 150.01, "category": "Hotel"})
    assert flagged(rules.round_amounts(df, POLICY)) == ["L2"]


def test_weekend_and_holiday_for_restricted_categories():
    df = make({"category": "Office supplies", "expense_date": "2026-03-07"},          # Saturday
              {"category": "Office supplies", "expense_date": "2026-05-25"},          # Memorial Day
              {"category": "Office supplies", "expense_date": "2026-03-04"},          # Wednesday
              {"category": "Meals", "expense_date": "2026-03-07"})                    # travel meal: allowed
    assert flagged(rules.weekend_holiday(df, POLICY)) == ["L1", "L2"]


def test_blocked_category():
    df = make({"merchant": "Lucky Seven Casino", "merchant_type": "Casino"}, {})
    assert flagged(rules.blocked_categories(df, POLICY)) == ["L1"]


def test_keyword_description_check():
    df = make({"description": "Gym membership renewal"}, {"description": "Dinner while traveling - Boston"})
    assert flagged(heuristic_mismatches(df)) == ["L1"]


def test_prepare_rejects_missing_columns():
    with pytest.raises(ValueError, match="Missing required columns"):
        rules.prepare(pd.DataFrame({"line_id": ["L1"]}))


def test_policy_round_trips_through_csv(tmp_path):
    path = tmp_path / "policy.csv"
    POLICY.to_frame().to_csv(path, index=False)
    loaded = Policy.from_csv(path)
    assert loaded.category_limits == POLICY.category_limits
    assert loaded.holidays == POLICY.holidays
    assert loaded.blocked_merchant_types == POLICY.blocked_merchant_types


def test_build_exceptions_sorts_by_severity_then_amount():
    df = make({"amount_usd": 120.55, "receipt_attached": "N"},                       # over limit + missing: Medium
              {"merchant": "Lucky Seven Casino", "merchant_type": "Casino", "amount_usd": 20.33})  # High
    ex = rules.build_exceptions(df, rules.run_rules(df, POLICY))
    assert list(ex["line_id"]) == ["L2", "L1"]
    assert ex.loc[1, "rule_codes"] == "over_limit|missing_receipt"
