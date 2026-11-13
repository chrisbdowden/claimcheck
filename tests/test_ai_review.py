"""AI step tested with a fake Claude client (no network, no key needed)."""
import json
from types import SimpleNamespace

import pandas as pd

from src import ai_review
from src.pipeline import run
from src.policy import default_policy


class FakeMessages:
    def __init__(self):
        self.calls = 0

    def create(self, model, max_tokens, system, messages):
        self.calls += 1
        batch = json.loads(messages[0]["content"])
        if system.startswith("You review"):
            out = [{"line_id": r["line_id"], "reason": "Personal vacation dinner, not business."}
                   for r in batch if "vacation" in r["description"]]
        else:
            out = {r["line_id"]: f"AI reason for {r['line_id']}" for r in batch}
        return SimpleNamespace(content=[SimpleNamespace(type="text", text="Here you go:\n" + json.dumps(out))])


def fake_reviewer(tmp_path):
    rv = ai_review.AIReviewer.__new__(ai_review.AIReviewer)
    rv.client = SimpleNamespace(messages=FakeMessages())
    rv.model = "test-model"
    rv.cache_path = tmp_path / "cache.json"
    rv.cache = {}
    return rv


def sample():
    return pd.DataFrame([
        {"line_id": "L1", "report_id": "R1", "employee_id": "E1", "expense_date": "2026-03-04",
         "merchant": "Harborline Grill", "category": "Meals", "amount_usd": 76.70, "receipt_attached": "Y",
         "description": "Family dinner while on vacation"},
        {"line_id": "L2", "report_id": "R1", "employee_id": "E1", "expense_date": "2026-03-04",
         "merchant": "CityRide", "category": "Ground transport", "amount_usd": 88.12, "receipt_attached": "N",
         "description": "Taxi to airport"},
    ])


def test_ai_catches_subtle_mismatch_and_writes_reasons(tmp_path, monkeypatch):
    rv = fake_reviewer(tmp_path)
    monkeypatch.setattr(ai_review, "AIReviewer", lambda api_key=None: rv)
    res = run(sample(), default_policy(), use_ai=True, api_key="test")
    assert res.ai_used
    ex = res.exceptions.set_index("line_id")
    assert ex.loc["L1", "rule_codes"] == "description_mismatch"      # keyword check would miss this
    assert ex.loc["L2", "rule_codes"] == "missing_receipt"
    assert ex.loc["L2", "reason"] == "AI reason for L2"


def test_responses_are_cached(tmp_path):
    rv = fake_reviewer(tmp_path)
    df = ai_review.pd.DataFrame(sample())
    rv.find_mismatches(df)
    rv.find_mismatches(df)
    assert rv.client.messages.calls == 1
    assert (tmp_path / "cache.json").exists()


def test_offline_mode_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    res = run(sample(), default_policy(), use_ai=True)
    assert not res.ai_used
    assert "L1" not in set(res.exceptions["line_id"])                 # subtle case needs the AI
    assert any("No ANTHROPIC_API_KEY" in n for n in res.notes)
