"""AI step tested with fake Claude and Grok clients (no network, no real keys)."""
import json
from types import SimpleNamespace

import pandas as pd
import pytest

from src import ai_review
from src.pipeline import run
from src.policy import default_policy


def _answer(system: str, prompt: str) -> str:
    batch = json.loads(prompt)
    if system.startswith("You review"):
        out = [{"line_id": r["line_id"], "reason": "Personal vacation dinner, not business."}
               for r in batch if "vacation" in r["description"]]
    else:
        out = {r["line_id"]: f"AI reason for {r['line_id']}" for r in batch}
    return "Here you go:\n" + json.dumps(out)


class FakeAnthropic:
    """Mimics anthropic.Anthropic().messages.create."""

    def __init__(self):
        self.calls = 0
        self.messages = self

    def create(self, model, max_tokens, system, messages):
        self.calls += 1
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=_answer(system, messages[0]["content"]))])


class FakeXAI:
    """Mimics openai.OpenAI(base_url=xAI).chat.completions.create."""

    def __init__(self):
        self.calls = 0
        self.chat = SimpleNamespace(completions=self)

    def create(self, model, max_tokens, messages):
        self.calls += 1
        text = _answer(messages[0]["content"], messages[1]["content"])
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text))])


FAKES = {"anthropic": FakeAnthropic, "xai": FakeXAI}


def fake_reviewer(provider, tmp_path):
    rv = ai_review.AIReviewer.__new__(ai_review.AIReviewer)
    rv.provider = provider
    rv.client = FAKES[provider]()
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


@pytest.fixture(autouse=True)
def no_real_keys(monkeypatch):
    for name in ("AI_PROVIDER", "ANTHROPIC_API_KEY", "XAI_API_KEY", "CLAIMCHECK_MODEL"):
        monkeypatch.delenv(name, raising=False)


@pytest.mark.parametrize("provider", ["anthropic", "xai"])
def test_ai_catches_subtle_mismatch_and_writes_reasons(provider, tmp_path, monkeypatch):
    rv = fake_reviewer(provider, tmp_path)
    monkeypatch.setattr(ai_review, "AIReviewer", lambda api_key=None, provider=None: rv)
    res = run(sample(), default_policy(), use_ai=True, api_key="test", provider=provider)
    assert res.ai_used
    assert res.summary["ai_mode"] == f"{provider}: test-model"
    ex = res.exceptions.set_index("line_id")
    assert ex.loc["L1", "rule_codes"] == "description_mismatch"      # keyword check would miss this
    assert ex.loc["L2", "rule_codes"] == "missing_receipt"
    assert ex.loc["L2", "reason"] == "AI reason for L2"


@pytest.mark.parametrize("provider", ["anthropic", "xai"])
def test_responses_are_cached(provider, tmp_path):
    rv = fake_reviewer(provider, tmp_path)
    rv.find_mismatches(sample())
    rv.find_mismatches(sample())
    assert rv.client.calls == 1
    assert (tmp_path / "cache.json").exists()


@pytest.mark.parametrize("provider,key_name", [("anthropic", "ANTHROPIC_API_KEY"), ("xai", "XAI_API_KEY")])
def test_offline_mode_without_key(provider, key_name):
    res = run(sample(), default_policy(), use_ai=True, provider=provider)
    assert not res.ai_used
    assert "L1" not in set(res.exceptions["line_id"])                 # subtle case needs the AI
    assert any(f"No {key_name}" in n for n in res.notes)


def test_provider_selection(monkeypatch):
    assert ai_review.resolve_provider() == "anthropic"
    monkeypatch.setenv("XAI_API_KEY", "placeholder")
    assert ai_review.resolve_provider() == "xai"                      # first key that is set
    monkeypatch.setenv("AI_PROVIDER", "anthropic")
    assert ai_review.resolve_provider() == "anthropic"                # explicit setting wins
    with pytest.raises(ValueError, match="Unknown AI_PROVIDER"):
        ai_review.resolve_provider("gemini")


def test_missing_key_raises_clear_error():
    with pytest.raises(RuntimeError, match="XAI_API_KEY is not set"):
        ai_review.AIReviewer(provider="xai")
