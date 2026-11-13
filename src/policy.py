"""Expense policy: loading and defaults.

The policy lives in a simple long-format CSV (data/policy.csv) so a finance
user can edit it in Excel without touching code:

    setting,key,value
    category_limit,Meals,100
    receipt_threshold,,75
    round_amount_threshold,,100
    blocked_merchant_type,Casino,
    weekend_restricted_category,Software,
    shared_expense_category,Meals,
    holiday,2026-01-01,New Year's Day
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd


@dataclass
class Policy:
    category_limits: dict[str, float] = field(default_factory=dict)
    receipt_threshold: float = 75.0
    round_amount_threshold: float = 100.0
    blocked_merchant_types: set[str] = field(default_factory=set)
    # Categories where business spend on a weekend/holiday is unusual.
    weekend_restricted_categories: set[str] = field(default_factory=set)
    # Categories that colleagues commonly share (meals, cabs). Identical
    # amounts claimed by two employees here suggest a double claim. Hotels,
    # airfare and conference fees are excluded on purpose: identical group
    # rates for colleagues at the same event are normal.
    shared_expense_categories: set[str] = field(default_factory=set)
    holidays: set[pd.Timestamp] = field(default_factory=set)

    @classmethod
    def from_csv(cls, path: str | Path) -> "Policy":
        return cls.from_frame(pd.read_csv(path, dtype=str).fillna(""))

    @classmethod
    def from_frame(cls, df: pd.DataFrame) -> "Policy":
        p = cls()
        for row in df.itertuples(index=False):
            setting, key, value = row.setting.strip(), row.key.strip(), row.value.strip()
            if setting == "category_limit":
                p.category_limits[key] = float(value)
            elif setting == "receipt_threshold":
                p.receipt_threshold = float(value)
            elif setting == "round_amount_threshold":
                p.round_amount_threshold = float(value)
            elif setting == "blocked_merchant_type":
                p.blocked_merchant_types.add(key)
            elif setting == "weekend_restricted_category":
                p.weekend_restricted_categories.add(key)
            elif setting == "shared_expense_category":
                p.shared_expense_categories.add(key)
            elif setting == "holiday":
                p.holidays.add(pd.Timestamp(key))
            else:
                raise ValueError(f"Unknown policy setting: {setting!r}")
        return p

    def to_frame(self) -> pd.DataFrame:
        rows = [("category_limit", k, f"{v:g}") for k, v in self.category_limits.items()]
        rows.append(("receipt_threshold", "", f"{self.receipt_threshold:g}"))
        rows.append(("round_amount_threshold", "", f"{self.round_amount_threshold:g}"))
        rows += [("blocked_merchant_type", k, "") for k in sorted(self.blocked_merchant_types)]
        rows += [("weekend_restricted_category", k, "") for k in sorted(self.weekend_restricted_categories)]
        rows += [("shared_expense_category", k, "") for k in sorted(self.shared_expense_categories)]
        rows += [("holiday", d.strftime("%Y-%m-%d"), "") for d in sorted(self.holidays)]
        return pd.DataFrame(rows, columns=["setting", "key", "value"])


def default_policy() -> Policy:
    return Policy(
        category_limits={
            "Airfare": 800,
            "Hotel": 350,
            "Meals": 100,
            "Ground transport": 150,
            "Client entertainment": 300,
            "Software": 200,
            "Office supplies": 150,
            "Conference fees": 1200,
        },
        receipt_threshold=75,
        round_amount_threshold=100,
        blocked_merchant_types={"Casino", "Liquor store", "Gift cards", "Spa"},
        weekend_restricted_categories={"Software", "Office supplies", "Client entertainment"},
        shared_expense_categories={"Meals", "Client entertainment", "Ground transport"},
        holidays={
            pd.Timestamp(d)
            for d in ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19"]
        },
    )
