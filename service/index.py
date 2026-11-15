"""ClaimCheck API: the Python engine as a web service for the Lovable front end.

Endpoints (all JSON):
    GET  /api/health    service status, whether live AI is available, and the limits
    GET  /api/policy    default expense policy, in the front end's shape
    GET  /api/sample    the bundled synthetic dataset (with its answer key) and policy
    POST /api/analyze   run the rules (and optional live AI) on the sample or uploaded lines

The service is stateless: review decisions stay in the browser. Live AI is protected by
size limits, a per-visitor rate limit, a time budget, and the spending cap on the
Anthropic account; when any limit applies, the analysis falls back to rules only and
says so in `notes`.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from collections import OrderedDict, deque
from pathlib import Path
from typing import Literal

import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from claimcheck_engine import ai_review
from claimcheck_engine.evaluate import evaluate
from claimcheck_engine.pipeline import run
from claimcheck_engine.policy import Policy
from claimcheck_engine.rules import RULE_LABELS, RULE_ORDER, SEVERITY

VERSION = "1.0.0"
HERE = Path(__file__).resolve().parent
SAMPLE_CSV = HERE / "data" / "expenses.csv"
POLICY_CSV = HERE / "data" / "policy.csv"


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


LIMITS = {
    "max_lines": _env_int("CLAIMCHECK_MAX_LINES", 5000),
    "ai_max_lines": _env_int("CLAIMCHECK_AI_MAX_LINES", 2500),
    "ai_per_visitor": _env_int("CLAIMCHECK_AI_PER_VISITOR", 3),
    "ai_window_minutes": _env_int("CLAIMCHECK_AI_WINDOW_MINUTES", 10),
    "ai_per_hour_total": _env_int("CLAIMCHECK_AI_PER_HOUR", 20),
    "ai_time_budget_seconds": _env_int("CLAIMCHECK_AI_SECONDS", 40),
}

# Vercel's filesystem is read-only except /tmp; keep the AI response cache there.
os.environ.setdefault("CLAIMCHECK_CACHE_PATH", "/tmp/claimcheck_ai_cache.json")

app = FastAPI(
    title="ClaimCheck API",
    version=VERSION,
    description="Expense exception detection on synthetic data. Rules first; AI explains and checks descriptions.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=(
        r"https://([a-z0-9-]+\.)*(lovable\.app|lovableproject\.com|lovable\.dev)"
        r"|https://claimcheck-dowden\.streamlit\.app"
        r"|http://(localhost|127\.0\.0\.1)(:\d+)?"
    ),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    max_age=600,
)


# ---------------------------------------------------------------- models

class HolidayIn(BaseModel):
    date: str
    name: str = ""


class PolicyIn(BaseModel):
    """The front end's Policy shape (src/lib/types.ts)."""
    categoryLimits: dict[str, float]
    receiptThreshold: float
    roundNumberThreshold: float
    blockedMerchantTypes: list[str] = []
    weekendRestrictedCategories: list[str] = []
    sharedExpenseCategories: list[str] = []
    holidays: list[HolidayIn] = []


class LineIn(BaseModel):
    line_id: str
    report_id: str
    employee_id: str
    expense_date: str
    merchant: str
    merchant_type: str = ""
    category: str
    amount_usd: float
    receipt_attached: bool | str
    description: str = ""
    planted_issue: str | None = None


class AnalyzeIn(BaseModel):
    source: Literal["bundled", "upload"] = "bundled"
    lines: list[LineIn] | None = None
    policy: PolicyIn | None = None
    use_ai: bool = False


# ---------------------------------------------------------------- policy and data

def policy_to_dict(p: Policy) -> dict:
    names = {"2026-01-01": "New Year's Day", "2026-01-19": "Martin Luther King Jr. Day",
             "2026-02-16": "Presidents' Day", "2026-05-25": "Memorial Day", "2026-06-19": "Juneteenth"}
    return {
        "categoryLimits": dict(p.category_limits),
        "receiptThreshold": p.receipt_threshold,
        "roundNumberThreshold": p.round_amount_threshold,
        "blockedMerchantTypes": sorted(p.blocked_merchant_types),
        "weekendRestrictedCategories": sorted(p.weekend_restricted_categories),
        "sharedExpenseCategories": sorted(p.shared_expense_categories),
        "holidays": [{"date": d.strftime("%Y-%m-%d"), "name": names.get(d.strftime("%Y-%m-%d"), "")}
                     for d in sorted(p.holidays)],
    }


def policy_from_in(p: PolicyIn) -> Policy:
    try:
        return Policy(
            category_limits={k: float(v) for k, v in p.categoryLimits.items()},
            receipt_threshold=float(p.receiptThreshold),
            round_amount_threshold=float(p.roundNumberThreshold),
            blocked_merchant_types=set(p.blockedMerchantTypes),
            weekend_restricted_categories=set(p.weekendRestrictedCategories),
            shared_expense_categories=set(p.sharedExpenseCategories),
            holidays={pd.Timestamp(h.date) for h in p.holidays},
        )
    except (ValueError, TypeError) as e:
        raise HTTPException(422, f"Invalid policy: {e}") from None


def default_policy() -> Policy:
    return Policy.from_csv(POLICY_CSV)


def sample_frame() -> pd.DataFrame:
    return pd.read_csv(SAMPLE_CSV, dtype={"line_id": str}, keep_default_na=False)


def line_records(df: pd.DataFrame) -> list[dict]:
    out = []
    for r in df.to_dict("records"):
        rec = {
            "line_id": str(r["line_id"]),
            "report_id": str(r["report_id"]),
            "employee_id": str(r["employee_id"]),
            "expense_date": str(r["expense_date"])[:10],
            "merchant": str(r["merchant"]),
            "merchant_type": str(r.get("merchant_type", "") or ""),
            "category": str(r["category"]),
            "amount_usd": round(float(r["amount_usd"]), 2),
            "receipt_attached": str(r["receipt_attached"]).strip().upper() in ("Y", "YES", "TRUE", "1"),
            "description": str(r.get("description", "") or ""),
        }
        if "planted_issue" in r:
            rec["planted_issue"] = str(r["planted_issue"] or "")
        if "employee_name" in r:
            rec["employee_name"] = str(r["employee_name"] or "")
        out.append(rec)
    return out


# ---------------------------------------------------------------- limits and caches

class RateLimiter:
    """Best-effort, per-instance limits on live AI runs (Vercel may run several instances)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.by_visitor: dict[str, deque] = {}
        self.all_runs: deque = deque()

    def allow(self, visitor: str) -> tuple[bool, str]:
        now = time.time()
        window = LIMITS["ai_window_minutes"] * 60
        with self.lock:
            runs = self.by_visitor.setdefault(visitor, deque())
            while runs and now - runs[0] > window:
                runs.popleft()
            while self.all_runs and now - self.all_runs[0] > 3600:
                self.all_runs.popleft()
            if len(runs) >= LIMITS["ai_per_visitor"]:
                return False, (f"Live AI is limited to {LIMITS['ai_per_visitor']} runs per visitor every "
                               f"{LIMITS['ai_window_minutes']} minutes; this analysis used rules only.")
            if len(self.all_runs) >= LIMITS["ai_per_hour_total"]:
                return False, "The demo's hourly live-AI allowance is used up; this analysis used rules only."
            runs.append(now)
            self.all_runs.append(now)
            return True, ""


limiter = RateLimiter()
_results: OrderedDict[str, dict] = OrderedDict()
_results_lock = threading.Lock()


def _cache_get(key: str) -> dict | None:
    with _results_lock:
        if key in _results:
            _results.move_to_end(key)
            return _results[key]
    return None


def _cache_put(key: str, value: dict) -> None:
    with _results_lock:
        _results[key] = value
        _results.move_to_end(key)
        while len(_results) > 16:
            _results.popitem(last=False)


def visitor_id(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")
    return hashlib.sha256(ip.encode()).hexdigest()[:16]  # never store raw IPs


def ai_status() -> dict:
    provider = ai_review.resolve_provider()
    available = bool(ai_review.available_key(provider))
    model = os.environ.get("CLAIMCHECK_MODEL") or ai_review.PROVIDERS[provider][1]
    return {"available": available, "provider": provider if available else None,
            "model": model if available else None}


# ---------------------------------------------------------------- response building

def build_response(raw: pd.DataFrame, policy: Policy, result, ai_requested: bool) -> dict:
    lines = {r["line_id"]: r for r in line_records(raw)}
    findings: dict[str, list[dict]] = {}
    order = {r: i for i, r in enumerate(RULE_ORDER)}
    seen = set()
    for h in sorted(result.hits, key=lambda h: (h["line_id"], order.get(h["rule"], 99))):
        key = (h["line_id"], h["rule"])
        if key in seen:
            continue
        seen.add(key)
        findings.setdefault(h["line_id"], []).append({
            "rule": h["rule"],
            "severity": SEVERITY[h["rule"]],
            "explanation": h["detail"],
            "relatedLineIds": list(h.get("related", [])),
        })

    flagged = []
    for row in result.exceptions.itertuples():
        flagged.append({
            "line": lines[row.line_id],
            "findings": findings.get(row.line_id, []),
            "severity": row.severity,
            "reason": row.reason,
        })

    by_rule = {r: 0 for r in RULE_ORDER}
    for f in flagged:
        for fd in f["findings"]:
            by_rule[fd["rule"]] += 1
    by_severity = {s: sum(1 for f in flagged if f["severity"] == s) for s in ("High", "Medium", "Low")}

    s = result.summary
    response = {
        "engine": "python",
        "version": VERSION,
        "mode": "ai" if result.ai_used else "offline",
        "ai": {
            "requested": ai_requested,
            "used": result.ai_used,
            "model": s.get("ai_mode") if result.ai_used else None,
            "calls": s.get("ai_calls", 0),
        },
        "notes": result.notes,
        "summary": {
            "lines_reviewed": s["lines_reviewed"],
            "lines_flagged": s["lines_flagged"],
            "dollars_reviewed": round(s["dollars_reviewed"], 2),
            "dollars_flagged": round(s["dollars_flagged"], 2),
            "high_severity": s["high_severity"],
            "by_severity": by_severity,
            "flags_by_rule": by_rule,
            "seconds": s["seconds"],
        },
        "flagged": flagged,
        "evaluation": None,
        "policy": policy_to_dict(policy),
        "limits": LIMITS,
    }

    if "planted_issue" in raw.columns and raw["planted_issue"].astype(str).str.strip().ne("").any():
        rep = evaluate(raw, result.exceptions)
        label_to_id = {v: k for k, v in RULE_LABELS.items()}
        per_rule = []
        totals = None
        for r in rep.by_rule.to_dict("records"):
            entry = {
                "rule": label_to_id.get(r["rule"], "all"),
                "label": r["rule"],
                "planted": int(r["planted"]), "detected": int(r["flagged"]), "tp": int(r["true_positives"]),
                "fp": int(r["false_positives"]), "missed": int(r["missed"]),
                "precision": None if pd.isna(r["precision"]) else float(r["precision"]),
                "recall": None if pd.isna(r["recall"]) else float(r["recall"]),
            }
            if entry["rule"] == "all":
                totals = entry
            else:
                per_rule.append(entry)
        lt = rep.lines
        response["evaluation"] = {
            "per_rule": per_rule,
            "rule_totals": totals,
            "tx_totals": {
                "lines": lt["lines_total"],
                "planted_lines": lt["lines_planted"],
                "flagged": lt["lines_flagged"],
                "tp": lt["planted_lines_found"],
                "fp": lt["clean_lines_flagged"],
                "missed": lt["lines_planted"] - lt["planted_lines_found"],
            },
        }
    return response


# ---------------------------------------------------------------- endpoints

@app.get("/")
def root() -> dict:
    return {"service": "ClaimCheck API", "version": VERSION, "docs": "/docs", "health": "/api/health"}


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "version": VERSION, "ai": ai_status(), "limits": LIMITS,
            "rules": [{"id": r, "label": RULE_LABELS[r], "severity": SEVERITY[r]} for r in RULE_ORDER]}


@app.get("/api/policy")
def get_policy() -> dict:
    return policy_to_dict(default_policy())


@app.get("/api/sample")
def get_sample() -> dict:
    df = sample_frame()
    return {"lines": line_records(df), "policy": policy_to_dict(default_policy()),
            "note": "Synthetic data. planted_issue is the answer key (rule IDs joined with |); never a detection input."}


@app.post("/api/analyze")
def analyze(body: AnalyzeIn, request: Request) -> dict:
    if body.source == "upload":
        if not body.lines:
            raise HTTPException(422, "source 'upload' needs a non-empty 'lines' list")
        raw = pd.DataFrame([ln.model_dump() for ln in body.lines])
        if raw["planted_issue"].isna().all():
            raw = raw.drop(columns="planted_issue")
        else:
            raw["planted_issue"] = raw["planted_issue"].fillna("")
    else:
        raw = sample_frame()
    if len(raw) > LIMITS["max_lines"]:
        raise HTTPException(413, f"Too many lines: {len(raw):,} (limit {LIMITS['max_lines']:,})")
    if raw["line_id"].astype(str).duplicated().any():
        raise HTTPException(422, "line_id values must be unique")

    policy = policy_from_in(body.policy) if body.policy else default_policy()

    key_material = json.dumps({"lines": line_records(raw) if body.source == "upload" else "bundled",
                               "policy": policy_to_dict(policy), "ai": body.use_ai,
                               "model": ai_status()["model"]}, sort_keys=True, default=str)
    cache_key = hashlib.sha256(key_material.encode()).hexdigest()
    cached = _cache_get(cache_key)
    if cached is not None:
        return {**cached, "cached": True}

    notes: list[str] = []
    use_ai = body.use_ai
    if use_ai and not ai_status()["available"]:
        use_ai = False
        notes.append("Live AI isn't configured on this server; used rules only.")
    if use_ai and len(raw) > LIMITS["ai_max_lines"]:
        use_ai = False
        notes.append(f"Live AI is limited to {LIMITS['ai_max_lines']:,} lines per analysis; used rules only.")
    if use_ai:
        allowed, why = limiter.allow(visitor_id(request))
        if not allowed:
            use_ai = False
            notes.append(why)

    try:
        result = run(raw, policy, use_ai=use_ai, ai_deadline_s=LIMITS["ai_time_budget_seconds"], ai_workers=8)
    except ValueError as e:  # bad columns, bad dates, etc.
        raise HTTPException(422, str(e)) from None
    result.notes = notes + result.notes
    response = build_response(raw, policy, result, body.use_ai)
    response["cached"] = False
    if not (body.use_ai and not result.ai_used and not notes):  # don't cache transient AI failures
        _cache_put(cache_key, response)
    return response
