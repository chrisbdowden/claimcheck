"""Phase 1 policy configuration acceptance tests."""
import pandas as pd
import pytest
from src.policy import Policy, default_policy


def test_default_counts():
    p = default_policy()
    assert len(p.to_frame()) == 25
    assert len(p.category_limits) == 8
    assert len(p.holidays) == 5


def test_round_trip(tmp_path):
    original = default_policy().to_frame()
    path = tmp_path / 'policy.csv'
    original.to_csv(path, index=False)
    restored = Policy.from_csv(path).to_frame()
    pd.testing.assert_frame_equal(original, restored)


def test_unknown_setting_rejected():
    with pytest.raises(ValueError, match='Unknown policy setting'):
        Policy.from_frame(pd.DataFrame([{'setting':'unknown', 'key':'a','value':'1'}]))


def test_missing_columns_rejected():
    with pytest.raises(ValueError, match='Missing policy columns'):
        Policy.from_frame(pd.DataFrame([{'setting':'holiday'}]))


def test_duplicate_setting_rejected():
    frame = pd.DataFrame([{'setting':'receipt_threshold','key':'','value':'75'}] * 2)
    with pytest.raises(ValueError, match='Duplicate'):
        Policy.from_frame(frame)


def test_negative_limit_rejected():
    with pytest.raises(ValueError, match='nonnegative'):
        Policy.from_frame(pd.DataFrame([{'setting':'category_limit','key':'Meals','value':'-1'}]))


def test_invalid_holiday_rejected():
    with pytest.raises(ValueError, match='Invalid ISO holiday'):
        Policy.from_frame(pd.DataFrame([{'setting':'holiday','key':'2026-02-30','value':''}]))
