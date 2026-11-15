"""AI review step (Claude or Grok API) with an offline fallback.

Two jobs:
1. Write a one-sentence reason for each flagged line that an AP reviewer can
   act on without re-reading the report.
2. Rule 10 - description mismatch: does the description fit a business
   expense in that category and at that merchant?

Without an API key (or with use_ai=False) the tool still runs: reasons come
from the rule details, and rule 10 uses a simple keyword check. The keyword
check only catches obvious mismatches; the AI step is what catches subtle
ones such as a personal dinner described as a "family dinner".

Two providers are supported, chosen by AI_PROVIDER ("anthropic" or "xai").
If AI_PROVIDER is unset, the first provider with a key set is used
(Anthropic, then xAI).

Responses are cached in output/ai_cache.json so re-runs cost nothing.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd

from .rules import DESCRIPTION_MISMATCH

PROVIDERS = {
    # provider: (API key variable, default model)
    "anthropic": ("ANTHROPIC_API_KEY", "claude-haiku-5-5"),
    "xai": ("XAI_API_KEY", "grok-4.5"),  # check docs.x.ai for current model names
}
XAI_BASE_URL = "https://api.x.ai/v1"


def resolve_provider(provider: str | None = None) -> str:
    """Pick the provider: explicit argument, then AI_PROVIDER, then the first key that is set."""
    name = (provider or os.environ.get("AI_PROVIDER") or "").strip().lower()
    if name:
        if name not in PROVIDERS:
            raise ValueError(f"Unknown AI_PROVIDER {name!r}; use one of: {', '.join(PROVIDERS)}")
        return name
    for candidate, (env, _) in PROVIDERS.items():
        if os.environ.get(env):
            return candidate
    return "anthropic"


def available_key(provider: str) -> str | None:
    """Return the provider's key from the environment, if set. Never print it."""
    return os.environ.get(PROVIDERS[provider][0]) or None
CACHE_PATH = Path(__file__).resolve().parent.parent / "output" / "ai_cache.json"
EXPLAIN_BATCH = 25
MISMATCH_BATCH = 50

# Words a business description in each category would normally contain.
CATEGORY_KEYWORDS = {
    "Airfare": ["flight", "airfare", "air fare", "plane", "airline"],
    "Hotel": ["hotel", "lodging", "room", "accommodation"],
    "Meals": ["lunch", "dinner", "breakfast", "meal", "coffee"],
    "Ground transport": ["taxi", "rideshare", "car service", "uber", "lyft", "airport", "transfer", "cab", "parking"],
    "Client entertainment": ["client", "customer", "prospect"],
    "Software": ["subscription", "license", "software", "saas"],
    "Office supplies": ["supplies", "paper", "toner", "pens", "notebooks", "office"],
    "Conference fees": ["registration", "conference", "summit", "forum", "event"],
}


# ---------------------------------------------------------------- offline

def template_reason(row) -> str:
    """Reason built from the rule details (used when AI is off)."""
    return str(row["details"])


def heuristic_mismatches(df: pd.DataFrame) -> list[dict]:
    """Flag descriptions with none of the category's expected words."""
    hits = []
    for row in df.itertuples():
        words = CATEGORY_KEYWORDS.get(row.category)
        if not words:
            continue
        text = row.description.lower()
        if not any(w in text for w in words):
            hits.append({
                "line_id": row.line_id,
                "rule": DESCRIPTION_MISMATCH,
                "detail": f'Description "{row.description}" does not describe a {row.category.lower()} expense.',
                "related": [],
            })
    return hits


# ---------------------------------------------------------------- AI providers

class AIReviewer:
    """Calls Claude or Grok in parallel batches, with a response cache and an optional time budget.

    Batches that fail or run past the deadline are recorded so the caller can fall back to the
    offline checks for those lines; nothing is silently skipped.
    """

    def __init__(self, api_key: str | None = None, model: str | None = None, provider: str | None = None,
                 cache_path: Path | None = None, max_workers: int = 8, deadline_s: float | None = None):
        self.provider = resolve_provider(provider)
        env, default_model = PROVIDERS[self.provider]
        key = api_key or available_key(self.provider)
        if not key:
            raise RuntimeError(f"{env} is not set")
        if self.provider == "anthropic":
            import anthropic  # imported here so the offline path needs no SDK

            self.client = anthropic.Anthropic(api_key=key, max_retries=1, timeout=deadline_s or 120)
        else:
            from openai import OpenAI  # xAI's API is OpenAI-compatible

            self.client = OpenAI(api_key=key, base_url=XAI_BASE_URL, max_retries=1, timeout=deadline_s or 120)
        self.model = model or os.environ.get("CLAIMCHECK_MODEL") or default_model
        self.cache_path = Path(cache_path or os.environ.get("CLAIMCHECK_CACHE_PATH") or CACHE_PATH)
        self.cache = self._load_cache()
        self.max_workers = max(1, max_workers)
        self.deadline = (time.monotonic() + deadline_s) if deadline_s else None
        self._lock = threading.Lock()
        self.failed_batches = 0
        self.unchecked_line_ids: set[str] = set()
        self.calls = 0

    # -- cache
    def _load_cache(self) -> dict:
        if self.cache_path.exists():
            try:
                return json.loads(self.cache_path.read_text())
            except (json.JSONDecodeError, OSError):
                return {}
        return {}

    def _save_cache(self) -> None:
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            with self._lock:
                data = json.dumps(self.cache, indent=1)
            self.cache_path.write_text(data)
        except OSError:  # read-only disk: keep the in-memory cache only
            pass

    def _key(self, system: str, prompt: str) -> str:
        return hashlib.sha256(f"{self.provider}\n{self.model}\n{system}\n{prompt}".encode()).hexdigest()

    def _ask(self, system: str, prompt: str) -> str:
        key = self._key(system, prompt)
        with self._lock:
            if key in self.cache:
                return self.cache[key]
        if self.deadline is not None and time.monotonic() > self.deadline:
            raise TimeoutError("AI time budget used up")
        if self.provider == "anthropic":
            msg = self.client.messages.create(
                model=self.model,
                max_tokens=4000,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        else:
            resp = self.client.chat.completions.create(
                model=self.model,
                max_tokens=4000,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            )
            text = resp.choices[0].message.content or ""
        with self._lock:
            self.cache[key] = text
            self.calls += 1
        return text

    def _run_batches(self, system: str, prompts: list[str]) -> list[str | None]:
        """Ask every prompt, in parallel. A failed or late batch returns None."""
        results: list[str | None] = [None] * len(prompts)
        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            futures = {pool.submit(self._ask, system, p): i for i, p in enumerate(prompts)}
            for fut, i in futures.items():
                try:
                    results[i] = fut.result()
                except Exception:
                    results[i] = None
        self._save_cache()
        return results

    @staticmethod
    def _parse_json(text: str):
        match = re.search(r"(\{.*\}|\[.*\])", text, re.S)
        if not match:
            raise ValueError("No JSON in model response")
        return json.loads(match.group(1))

    # -- job 1: reasons
    def explain(self, exceptions: pd.DataFrame) -> dict[str, str]:
        system = (
            "You are a senior accounts payable reviewer. For each flagged expense line, write ONE plain "
            "sentence (max 30 words) telling a reviewer what is wrong and what to check. Use the amounts, "
            "merchants, dates and line IDs given. Do not invent facts. Reply with JSON only: "
            '{"<line_id>": "<reason>", ...}'
        )
        records = exceptions[["line_id", "employee_id", "expense_date", "merchant", "category",
                              "amount_usd", "description", "rules", "details"]].copy()
        records["expense_date"] = records["expense_date"].dt.strftime("%Y-%m-%d")
        rows = records.to_dict("records")
        batches = [rows[i:i + EXPLAIN_BATCH] for i in range(0, len(rows), EXPLAIN_BATCH)]
        reasons: dict[str, str] = {}
        for text in self._run_batches(system, [json.dumps(b, indent=0) for b in batches]):
            if text is None:
                self.failed_batches += 1
                continue  # keep the template reasons for this batch
            try:
                out = self._parse_json(text)
                reasons.update({str(k): str(v) for k, v in out.items()})
            except Exception:
                self.failed_batches += 1
        return reasons

    # -- job 2: rule 10
    def find_mismatches(self, df: pd.DataFrame) -> list[dict]:
        system = (
            "You review corporate expense lines. Flag a line ONLY when its description clearly does not fit "
            "a business expense in its category at that merchant, for example a personal or family purchase, "
            "or a description that belongs to a different category. Do not flag vague but plausible business "
            "descriptions. Reply with JSON only: "
            '[{"line_id": "...", "reason": "<one sentence>"}] or [] if none.'
        )
        rows = df[["line_id", "merchant", "category", "amount_usd", "description"]].to_dict("records")
        batches = [rows[i:i + MISMATCH_BATCH] for i in range(0, len(rows), MISMATCH_BATCH)]
        hits = []
        texts = self._run_batches(system, [json.dumps(b, indent=0) for b in batches])
        for batch, text in zip(batches, texts):
            valid = {r["line_id"] for r in batch}
            try:
                out = self._parse_json(text) if text is not None else None
            except Exception:
                out = None
            if out is None:
                self.failed_batches += 1
                self.unchecked_line_ids |= valid  # caller falls back to the keyword check for these
                continue
            for item in out if isinstance(out, list) else []:
                lid = str(item.get("line_id", ""))
                if lid in valid:
                    hits.append({
                        "line_id": lid,
                        "rule": DESCRIPTION_MISMATCH,
                        "detail": str(item.get("reason", "Description does not fit the category.")),
                        "related": [],
                    })
        return hits
