"""ClaimCheck API tests. No network: the AI step uses a fake client."""
import json
import threading
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import index
from claimcheck_engine import ai_review

LOVABLE = "https://claimcheck-truth-compass.lovable.app"
REAL_REVIEWER = ai_review.AIReviewer  # captured before any test patches it


@pytest.fixture(autouse=True)
def clean_state(monkeypatch):
    for name in ("AI_PROVIDER", "ANTHROPIC_API_KEY", "XAI_API_KEY", "CLAIMCHECK_MODEL"):
        monkeypatch.delenv(name, raising=False)
    index._results.clear()
    index.limiter.by_visitor.clear()
    index.limiter.all_runs.clear()
    yield


@pytest.fixture
def client():
    return TestClient(index.app)


def small_lines():
    base = {"report_id": "R1", "employee_id": "E1", "expense_date": "2026-03-04", "merchant": "Harborline Grill",
            "merchant_type": "Restaurant", "category": "Meals", "amount_usd": 42.17, "receipt_attached": True,
            "description": "Lunch during audit fieldwork"}
    return [
        {**base, "line_id": "L1"},
        {**base, "line_id": "L2"},                                                      # exact duplicate of L1
        {**base, "line_id": "L3", "amount_usd": 120.55, "receipt_attached": False},     # over limit + no receipt
        {**base, "line_id": "L4", "description": "Family dinner while on vacation", "merchant": "Blue Fern Cafe"},
    ]


class FakeAnthropic:
    def __init__(self):
        self.calls = 0
        self.messages = self

    def create(self, model, max_tokens, system, messages):
        self.calls += 1
        batch = json.loads(messages[0]["content"])
        if system.startswith("You review"):
            out = [{"line_id": r["line_id"], "reason": "Personal vacation dinner."}
                   for r in batch if "vacation" in r["description"]]
        else:
            out = {r["line_id"]: f"AI reason for {r['line_id']}" for r in batch}
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=json.dumps(out))])


@pytest.fixture
def fake_ai(monkeypatch, tmp_path):
    """Pretend a key is configured and route the AI step to a fake client."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-placeholder")
    made = []

    def factory(**kwargs):
        rv = REAL_REVIEWER.__new__(REAL_REVIEWER)
        rv.provider, rv.model, rv.client = "anthropic", "test-model", FakeAnthropic()
        rv.cache_path, rv.cache = tmp_path / "c.json", {}
        rv.max_workers, rv.deadline, rv._lock = 4, None, threading.Lock()
        rv.failed_batches, rv.unchecked_line_ids, rv.calls = 0, set(), 0
        made.append(rv)
        return rv

    monkeypatch.setattr(ai_review, "AIReviewer", factory)
    return made


# ---------------------------------------------------------------- read endpoints

def test_health_reports_no_ai_without_key(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["ai"]["available"] is False
    assert [r["id"] for r in body["rules"]][:2] == ["exact_duplicate", "near_duplicate"]


def test_sample_and_policy_shapes(client):
    sample = client.get("/api/sample").json()
    assert len(sample["lines"]) == 1937
    line = sample["lines"][0]
    assert set(line) >= {"line_id", "report_id", "employee_id", "expense_date", "merchant", "merchant_type",
                         "category", "amount_usd", "receipt_attached", "description", "planted_issue"}
    assert isinstance(line["receipt_attached"], bool)
    policy = client.get("/api/policy").json()
    assert policy["categoryLimits"]["Meals"] == 100
    assert {"date": "2026-06-19", "name": "Juneteenth"} in policy["holidays"]


# ---------------------------------------------------------------- analyze

def test_bundled_offline_matches_cli_results(client):
    body = client.post("/api/analyze", json={"source": "bundled"}).json()
    assert body["mode"] == "offline"
    s = body["summary"]
    assert (s["lines_reviewed"], s["lines_flagged"], s["high_severity"]) == (1937, 100, 43)
    totals = body["evaluation"]["rule_totals"]
    assert (totals["planted"], totals["tp"], totals["fp"], totals["missed"]) == (109, 99, 4, 10)
    assert body["evaluation"]["tx_totals"]["fp"] == 4
    assert sum(s["by_severity"].values()) == s["lines_flagged"]


def test_findings_carry_related_lines(client):
    body = client.post("/api/analyze", json={"source": "upload", "lines": small_lines()}).json()
    flagged = {f["line"]["line_id"]: f for f in body["flagged"]}
    dup = next(fd for fd in flagged["L2"]["findings"] if fd["rule"] == "exact_duplicate")
    assert dup["relatedLineIds"] == ["L1"] and dup["severity"] == "High"
    assert {fd["rule"] for fd in flagged["L3"]["findings"]} == {"over_limit", "missing_receipt"}
    assert body["evaluation"] is None              # no answer key in an upload without planted_issue


def test_custom_policy_is_applied(client):
    policy = client.get("/api/policy").json()
    policy["categoryLimits"]["Meals"] = 200        # L3's $120.55 is now within the limit
    body = client.post("/api/analyze", json={"source": "upload", "lines": small_lines(), "policy": policy}).json()
    rules = {fd["rule"] for f in body["flagged"] if f["line"]["line_id"] == "L3" for fd in f["findings"]}
    assert "over_limit" not in rules and "missing_receipt" in rules


def test_validation_errors(client, monkeypatch):
    assert client.post("/api/analyze", json={"source": "upload"}).status_code == 422
    dup = small_lines()
    dup[1]["line_id"] = "L1"
    assert client.post("/api/analyze", json={"source": "upload", "lines": dup}).status_code == 422
    bad_date = small_lines()
    bad_date[0]["expense_date"] = "not-a-date"
    assert client.post("/api/analyze", json={"source": "upload", "lines": bad_date}).status_code == 422
    monkeypatch.setitem(index.LIMITS, "max_lines", 3)
    assert client.post("/api/analyze", json={"source": "upload", "lines": small_lines()}).status_code == 413


# ---------------------------------------------------------------- AI behaviour

def test_ai_requested_without_key_falls_back(client):
    body = client.post("/api/analyze", json={"source": "upload", "lines": small_lines(), "use_ai": True}).json()
    assert body["mode"] == "offline" and body["ai"]["requested"] is True
    assert any("isn't configured" in n for n in body["notes"])


def test_ai_mode_with_fake_client(client, fake_ai):
    body = client.post("/api/analyze", json={"source": "upload", "lines": small_lines(), "use_ai": True}).json()
    assert body["mode"] == "ai" and body["ai"]["used"] is True
    flagged = {f["line"]["line_id"]: f for f in body["flagged"]}
    assert flagged["L4"]["findings"][0]["rule"] == "description_mismatch"   # keyword check would miss this
    assert flagged["L2"]["reason"] == "AI reason for L2"


def test_ai_rate_limit_per_visitor(client, fake_ai, monkeypatch):
    monkeypatch.setitem(index.LIMITS, "ai_per_visitor", 2)
    modes = []
    for i in range(3):
        lines = small_lines()
        lines[0]["description"] = f"Lunch during audit fieldwork {i}"   # distinct payloads: no response cache
        body = client.post("/api/analyze", json={"source": "upload", "lines": lines, "use_ai": True}).json()
        modes.append(body["mode"])
    assert modes == ["ai", "ai", "offline"]
    assert any("limited to 2 runs" in n for n in body["notes"])


def test_ai_line_cap(client, fake_ai, monkeypatch):
    monkeypatch.setitem(index.LIMITS, "ai_max_lines", 3)
    body = client.post("/api/analyze", json={"source": "upload", "lines": small_lines(), "use_ai": True}).json()
    assert body["mode"] == "offline"
    assert any("limited to 3 lines" in n for n in body["notes"])


def test_identical_requests_are_served_from_cache(client, fake_ai):
    payload = {"source": "upload", "lines": small_lines(), "use_ai": True}
    first = client.post("/api/analyze", json=payload).json()
    second = client.post("/api/analyze", json=payload).json()
    assert first["cached"] is False and second["cached"] is True
    assert len(fake_ai) == 1                         # the second request made no AI calls
    assert index.limiter.by_visitor and sum(len(v) for v in index.limiter.by_visitor.values()) == 1


# ---------------------------------------------------------------- CORS

def test_cors_allows_lovable_and_blocks_others(client):
    ok = client.options("/api/analyze", headers={"Origin": LOVABLE, "Access-Control-Request-Method": "POST",
                                                  "Access-Control-Request-Headers": "content-type"})
    assert ok.headers.get("access-control-allow-origin") == LOVABLE
    bad = client.options("/api/analyze", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers


def test_ai_time_budget_falls_back_to_keyword_check(client, fake_ai, monkeypatch):
    """If the AI step runs out of time, unchecked lines get the keyword check and a note."""
    import time

    real_factory = ai_review.AIReviewer

    def expired(**kwargs):
        rv = real_factory(**kwargs)
        rv.deadline = time.monotonic() - 1          # budget already used up
        return rv

    monkeypatch.setattr(ai_review, "AIReviewer", expired)
    lines = small_lines()
    lines[0]["description"] = "Gym membership renewal"   # obvious mismatch the keyword check catches
    body = client.post("/api/analyze", json={"source": "upload", "lines": lines, "use_ai": True}).json()
    flagged = {f["line"]["line_id"]: f for f in body["flagged"]}
    assert "description_mismatch" in {fd["rule"] for fd in flagged["L1"]["findings"]}
    assert any("in time" in n for n in body["notes"])
