"""AI review step (Claude API) with an offline fallback.

Two jobs:
1. Write a one-sentence reason for each flagged line that an AP reviewer can
   act on without re-reading the report.
2. Rule 10 - description mismatch: does the description fit a business
   expense in that category and at that merchant?

Without an API key (or with use_ai=False) the tool still runs: reasons come
from the rule details, and rule 10 uses a simple keyword check. The keyword
check only catches obvious mismatches; the AI step is what catches subtle
ones such as a personal dinner described as a "family dinner".

Responses are cached in output/ai_cache.json so re-runs cost nothing.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path

import pandas as pd

from .rules import DESCRIPTION_MISMATCH

DEFAULT_MODEL = os.environ.get("CLAIMCHECK_MODEL", "claude-haiku-5-5")
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
            })
    return hits


# ---------------------------------------------------------------- Claude API

class AIReviewer:
    def __init__(self, api_key: str | None = None, model: str = DEFAULT_MODEL, cache_path: Path = CACHE_PATH):
        import anthropic  # imported here so the offline path needs no key

        key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        self.client = anthropic.Anthropic(api_key=key)
        self.model = model
        self.cache_path = Path(cache_path)
        self.cache = self._load_cache()

    # -- cache
    def _load_cache(self) -> dict:
        if self.cache_path.exists():
            try:
                return json.loads(self.cache_path.read_text())
            except json.JSONDecodeError:
                return {}
        return {}

    def _save_cache(self) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps(self.cache, indent=1))

    def _ask(self, system: str, prompt: str) -> str:
        key = hashlib.sha256(f"{self.model}\n{system}\n{prompt}".encode()).hexdigest()
        if key in self.cache:
            return self.cache[key]
        msg = self.client.messages.create(
            model=self.model,
            max_tokens=4000,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        self.cache[key] = text
        self._save_cache()
        return text

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
        reasons: dict[str, str] = {}
        records = exceptions[["line_id", "employee_id", "expense_date", "merchant", "category",
                              "amount_usd", "description", "rules", "details"]].copy()
        records["expense_date"] = records["expense_date"].dt.strftime("%Y-%m-%d")
        rows = records.to_dict("records")
        for i in range(0, len(rows), EXPLAIN_BATCH):
            batch = rows[i:i + EXPLAIN_BATCH]
            try:
                out = self._parse_json(self._ask(system, json.dumps(batch, indent=0)))
                reasons.update({str(k): str(v) for k, v in out.items()})
            except Exception:  # keep the template reason for this batch
                continue
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
        hits = []
        rows = df[["line_id", "merchant", "category", "amount_usd", "description"]].to_dict("records")
        for i in range(0, len(rows), MISMATCH_BATCH):
            batch = rows[i:i + MISMATCH_BATCH]
            valid = {r["line_id"] for r in batch}
            try:
                out = self._parse_json(self._ask(system, json.dumps(batch, indent=0)))
            except Exception:
                continue
            for item in out if isinstance(out, list) else []:
                lid = str(item.get("line_id", ""))
                if lid in valid:
                    hits.append({
                        "line_id": lid,
                        "rule": DESCRIPTION_MISMATCH,
                        "detail": str(item.get("reason", "Description does not fit the category.")),
                    })
        return hits
