"""Phase 1 policy configuration acceptance tests."""
from pathlib import Path

import pandas as pd
import pytest
from src.policy import Policy, default_policy

ROOT = Path(__file__).resolve().parents[1]


def test_default_counts():
    p = default_policy()
    assert len(p.to_frame()) == 25
    assert len(p.category_limits) == 8
    assert len(p.holidays) == 5


def test_round_trip(tmp_path):
    original = default_policy().to_frame()
    path = tmp_path / "policy.csv"
    original.to_csv(path, index=False)
    restored = Policy.from_csv(path).to_frame()
    pd.testing.assert_frame_equal(original, restored)


def test_committed_policy_csv_matches_default():
    loaded = Policy.from_csv(ROOT / "data" / "policy.csv")
    pd.testing.assert_frame_equal(loaded.to_frame(), default_policy().to_frame())


def test_unknown_setting_rejected():
    with pytest.raises(ValueError, match="Unknown policy setting"):
        Policy.from_frame(pd.DataFrame([{"setting": "unknown", "key": "a", "value": "1"}]))


def test_missing_columns_rejected():
    with pytest.raises(ValueError, match="Missing policy columns"):
        Policy.from_frame(pd.DataFrame([{"setting": "holiday"}]))


def test_duplicate_setting_rejected():
    frame = pd.DataFrame([{"setting": "receipt_threshold", "key": "", "value": "75"}] * 2)
    with pytest.raises(ValueError, match="Duplicate"):
        Policy.from_frame(frame)


def test_duplicate_holiday_rejected():
    frame = pd.DataFrame(
        [
            {"setting": "holiday", "key": "2026-01-01", "value": ""},
            {"setting": "holiday", "key": "2026-01-01", "value": ""},
        ]
    )
    with pytest.raises(ValueError, match="Duplicate"):
        Policy.from_frame(frame)


def test_negative_limit_rejected():
    with pytest.raises(ValueError, match="nonnegative"):
        Policy.from_frame(pd.DataFrame([{"setting": "category_limit", "key": "Meals", "value": "-1"}]))


@pytest.mark.parametrize("setting", ["receipt_threshold", "round_amount_threshold"])
def test_negative_threshold_rejected(setting):
    frame = pd.DataFrame([{"setting": setting, "key": "", "value": "-0.01"}])
    with pytest.raises(ValueError, match="nonnegative"):
        Policy.from_frame(frame)
    with pytest.raises(ValueError, match="nonnegative"):
        Policy(**{setting: -0.01})


@pytest.mark.parametrize("raw", ["abc", "", "75usd"])
def test_nonnumeric_amount_rejected(raw):
    frame = pd.DataFrame([{"setting": "category_limit", "key": "Meals", "value": raw}])
    with pytest.raises(ValueError):
        Policy.from_frame(frame)
    with pytest.raises(ValueError, match="Invalid numeric value"):
        Policy(category_limits={"Meals": raw})


@pytest.mark.parametrize("raw", ["nan", "inf", "-inf"])
def test_nonfinite_amount_rejected(raw):
    frame = pd.DataFrame([{"setting": "receipt_threshold", "key": "", "value": raw}])
    with pytest.raises(ValueError, match="finite"):
        Policy.from_frame(frame)
    with pytest.raises(ValueError, match="finite"):
        Policy(receipt_threshold=float(raw))


def test_blank_category_name_rejected():
    with pytest.raises(ValueError, match="category key"):
        Policy.from_frame(pd.DataFrame([{"setting": "category_limit", "key": "   ", "value": "10"}]))
    with pytest.raises(ValueError, match="nonblank"):
        Policy(category_limits={"": 10})


def test_zero_amount_remains_valid():
    loaded = Policy.from_frame(pd.DataFrame([{"setting": "category_limit", "key": "Meals", "value": "0"}]))
    assert loaded.category_limits["Meals"] == 0
    direct = Policy(category_limits={"Meals": 0}, receipt_threshold=0, round_amount_threshold=0)
    assert direct.receipt_threshold == 0


def test_invalid_holiday_rejected():
    with pytest.raises(ValueError, match="Invalid ISO holiday"):
        Policy.from_frame(pd.DataFrame([{"setting": "holiday", "key": "2026-02-30", "value": ""}]))
