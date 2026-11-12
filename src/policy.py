"""Expense-policy configuration for the ClaimCheck synthetic-data prototype."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import math
import pandas as pd

SETTINGS = {"category_limit", "receipt_threshold", "round_amount_threshold", "blocked_merchant_type", "weekend_restricted_category", "shared_expense_category", "holiday"}
SINGLETONS = {"receipt_threshold", "round_amount_threshold"}


def _money(value: object, label: str) -> float:
    """Accept a finite, nonnegative amount. Reject booleans, text, and infinities."""
    if isinstance(value, bool):
        raise ValueError(f"Invalid numeric value for {label}: {value!r}")
    try:
        number = float(value)
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Invalid numeric value for {label}: {value!r}") from exc
    if not math.isfinite(number) or number < 0:
        raise ValueError(f"{label} must be finite and nonnegative")
    return number


def _category_limits(values: object) -> dict[str, float]:
    if not isinstance(values, dict):
        raise ValueError("category_limits must be a mapping of category to amount")
    cleaned: dict[str, float] = {}
    for key, value in values.items():
        if not isinstance(key, str) or not key.strip():
            raise ValueError(f"category_limit requires a nonblank category name: {key!r}")
        cleaned[key.strip()] = _money(value, "category_limit")
    return cleaned


def _names(values: object, label: str) -> set[str]:
    if not isinstance(values, (set, frozenset, list, tuple)):
        raise ValueError(f"{label} must be a collection of names")
    cleaned: set[str] = set()
    for item in values:
        if not isinstance(item, str) or not item.strip():
            raise ValueError(f"{label} contains a blank or invalid name: {item!r}")
        cleaned.add(item.strip())
    return cleaned


def _holidays(values: object) -> set[pd.Timestamp]:
    if not isinstance(values, (set, frozenset, list, tuple)):
        raise ValueError("holidays must be a collection of dates")
    cleaned: set[pd.Timestamp] = set()
    for item in values:
        if not isinstance(item, pd.Timestamp) or pd.isna(item):
            raise ValueError(f"Invalid ISO holiday: {item!r}")
        day = pd.Timestamp(item.strftime("%Y-%m-%d"))
        if item != day:
            raise ValueError(f"Invalid ISO holiday: {item!r}")
        cleaned.add(day)
    return cleaned


@dataclass
class Policy:
    category_limits: dict[str, float] = field(default_factory=dict)
    receipt_threshold: float = 75.0
    round_amount_threshold: float = 100.0
    blocked_merchant_types: set[str] = field(default_factory=set)
    weekend_restricted_categories: set[str] = field(default_factory=set)
    shared_expense_categories: set[str] = field(default_factory=set)
    holidays: set[pd.Timestamp] = field(default_factory=set)

    def __post_init__(self) -> None:
        """Apply the same checks used when a CSV is loaded."""
        self._validate()

    def _validate(self) -> None:
        self.category_limits = _category_limits(self.category_limits)
        self.receipt_threshold = _money(self.receipt_threshold, "receipt_threshold")
        self.round_amount_threshold = _money(self.round_amount_threshold, "round_amount_threshold")
        self.blocked_merchant_types = _names(self.blocked_merchant_types, "blocked_merchant_type")
        self.weekend_restricted_categories = _names(self.weekend_restricted_categories, "weekend_restricted_category")
        self.shared_expense_categories = _names(self.shared_expense_categories, "shared_expense_category")
        self.holidays = _holidays(self.holidays)

    @classmethod
    def from_csv(cls, path: str | Path) -> "Policy":
        """Read a long-format policy CSV with setting,key,value columns."""
        return cls.from_frame(pd.read_csv(path, dtype=str, keep_default_na=False))

    @classmethod
    def from_frame(cls, df: pd.DataFrame) -> "Policy":
        """Reject unknown settings, malformed rows, and conflicting singleton values."""
        required = {"setting", "key", "value"}
        if not required.issubset(df.columns):
            raise ValueError(f"Missing policy columns: {sorted(required - set(df.columns))}")
        policy = cls()
        seen: set[tuple[str, str]] = set()
        for index, row in df.iterrows():
            setting, key, value = (str(row[col]).strip() for col in ("setting", "key", "value"))
            if setting not in SETTINGS:
                raise ValueError(f"Unknown policy setting on row {index}: {setting!r}")
            identity = (setting, key)
            if identity in seen:
                raise ValueError(f"Duplicate policy entry: {setting}/{key}")
            seen.add(identity)
            if setting == "category_limit":
                if not key or not value:
                    raise ValueError("category_limit requires category key and numeric value")
                policy.category_limits[key] = _money(value, setting)
            elif setting in SINGLETONS:
                if key or not value:
                    raise ValueError(f"{setting} requires empty key and numeric value")
                setattr(policy, setting, _money(value, setting))
            elif setting == "holiday":
                if not key or value:
                    raise ValueError("holiday requires date in key and empty value")
                try:
                    stamp = pd.Timestamp(key)
                    if stamp.strftime('%Y-%m-%d') != key:
                        raise ValueError()
                except (ValueError, TypeError) as exc:
                    raise ValueError(f"Invalid ISO holiday: {key!r}") from exc
                policy.holidays.add(stamp)
            else:
                if not key or value:
                    raise ValueError(f"{setting} requires a key and empty value")
                target = {"blocked_merchant_type": "blocked_merchant_types", "weekend_restricted_category": "weekend_restricted_categories", "shared_expense_category": "shared_expense_categories"}[setting]
                getattr(policy, target).add(key)
        policy._validate()
        return policy

    def to_frame(self) -> pd.DataFrame:
        """Export the policy in stable, Excel-friendly long CSV format."""
        rows: list[dict[str, str]] = []
        def add(setting: str, key: str, value: object = "") -> None:
            rows.append({"setting": setting, "key": key, "value": (format(value, "g") if isinstance(value, (int, float)) else str(value))})
        for category, limit in self.category_limits.items():
            add("category_limit", category, limit)
        add("receipt_threshold", "", self.receipt_threshold)
        add("round_amount_threshold", "", self.round_amount_threshold)
        for name, entries in (("blocked_merchant_type", self.blocked_merchant_types), ("weekend_restricted_category", self.weekend_restricted_categories), ("shared_expense_category", self.shared_expense_categories)):
            for entry in sorted(entries):
                add(name, entry)
        for date in sorted(self.holidays):
            add("holiday", date.strftime('%Y-%m-%d'))
        return pd.DataFrame(rows, columns=["setting", "key", "value"])


def default_policy() -> Policy:
    """Synthetic demonstration policy; not an employer or compliance policy."""
    return Policy(
        category_limits={"Airfare": 800, "Hotel": 350, "Meals": 100, "Ground transport": 150, "Client entertainment": 300, "Software": 200, "Office supplies": 150, "Conference fees": 1200},
        receipt_threshold=75,
        round_amount_threshold=100,
        blocked_merchant_types={"Casino", "Liquor store", "Gift cards", "Spa"},
        weekend_restricted_categories={"Software", "Office supplies", "Client entertainment"},
        shared_expense_categories={"Meals", "Client entertainment", "Ground transport"},
        holidays={pd.Timestamp(date) for date in ("2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19")},
    )
