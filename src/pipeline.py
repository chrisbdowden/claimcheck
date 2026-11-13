"""End-to-end run: rules -> AI review -> exception queue -> summary.

CLI:
    python -m src.pipeline                # uses ANTHROPIC_API_KEY if set
    python -m src.pipeline --no-ai        # offline: template reasons + keyword rule 10
    python -m src.pipeline --input my.csv --policy my_policy.csv
"""
from __future__ import annotations

import argparse
import time
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from . import ai_review
from .evaluate import evaluate, print_report
from .policy import Policy
from .rules import RULE_LABELS, RULE_ORDER, build_exceptions, for_export, prepare, run_rules

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Result:
    lines: pd.DataFrame
    exceptions: pd.DataFrame
    summary: dict
    ai_used: bool
    notes: list[str] = field(default_factory=list)


def run(raw: pd.DataFrame, policy: Policy, use_ai: bool = True, api_key: str | None = None,
        provider: str | None = None) -> Result:
    start = time.perf_counter()
    notes: list[str] = []
    df = prepare(raw)
    hits = run_rules(df, policy)

    reviewer = None
    if use_ai:
        name = ai_review.resolve_provider(provider)
        if api_key or ai_review.available_key(name):
            try:
                reviewer = ai_review.AIReviewer(api_key=api_key, provider=name)
            except Exception as e:  # missing package, bad key, etc.
                notes.append(f"AI review unavailable ({e}); used offline checks.")
        else:
            notes.append(f"No {ai_review.PROVIDERS[name][0]} found; used offline checks.")

    ai_used = False
    if reviewer:
        try:
            hits += reviewer.find_mismatches(df)
            ai_used = True
        except Exception as e:
            notes.append(f"AI description check failed ({e}); used keyword check.")
            hits += ai_review.heuristic_mismatches(df)
    else:
        hits += ai_review.heuristic_mismatches(df)

    exceptions = build_exceptions(df, hits)
    exceptions["reason"] = exceptions.apply(ai_review.template_reason, axis=1) if len(exceptions) else []
    if reviewer and len(exceptions):
        try:
            reasons = reviewer.explain(exceptions)
            exceptions["reason"] = [reasons.get(l, r) for l, r in zip(exceptions["line_id"], exceptions["reason"])]
        except Exception as e:
            notes.append(f"AI reasons failed ({e}); kept rule-based reasons.")

    counts = {RULE_LABELS[r]: 0 for r in RULE_ORDER}
    for codes in exceptions.get("rule_codes", []):
        for r in codes.split("|"):
            counts[RULE_LABELS[r]] += 1

    summary = {
        "lines_reviewed": len(df),
        "lines_flagged": len(exceptions),
        "dollars_reviewed": float(df["amount_usd"].sum()),
        "dollars_flagged": float(exceptions["amount_usd"].sum()) if len(exceptions) else 0.0,
        "high_severity": int((exceptions["severity"] == "High").sum()) if len(exceptions) else 0,
        "flags_by_rule": counts,
        "seconds": round(time.perf_counter() - start, 2),
    }
    summary["ai_mode"] = f"{reviewer.provider}: {reviewer.model}" if ai_used else "offline"
    return Result(df, exceptions, summary, ai_used, notes)


def main() -> None:
    ap = argparse.ArgumentParser(description="ClaimCheck: AI expense exception detector")
    ap.add_argument("--input", default=str(ROOT / "data" / "expenses.csv"))
    ap.add_argument("--policy", default=str(ROOT / "data" / "policy.csv"))
    ap.add_argument("--out", default=str(ROOT / "output"))
    ap.add_argument("--no-ai", action="store_true", help="skip the AI step (Claude or Grok API)")
    args = ap.parse_args()

    raw = pd.read_csv(args.input, dtype={"line_id": str})
    result = run(raw, Policy.from_csv(args.policy), use_ai=not args.no_ai)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for_export(result.exceptions).to_csv(out / "exceptions.csv", index=False)

    s = result.summary
    print(f"Mode: {'AI review (' + result.summary['ai_mode'] + ')' if result.ai_used else 'offline (no AI)'}")
    for n in result.notes:
        print(f"Note: {n}")
    print(f"Lines reviewed: {s['lines_reviewed']:,}  |  flagged: {s['lines_flagged']:,}  |  "
          f"high severity: {s['high_severity']}")
    print(f"Dollars flagged: ${s['dollars_flagged']:,.2f} of ${s['dollars_reviewed']:,.2f}  |  "
          f"run time: {s['seconds']}s")
    print(f"Exception queue written to {out / 'exceptions.csv'}")

    if "planted_issue" in raw.columns:
        report = evaluate(raw, result.exceptions)
        report.by_rule.to_csv(out / "accuracy.csv", index=False)
        report.errors.to_csv(out / "accuracy_errors.csv", index=False)
        print_report(report)
        print(f"Accuracy written to {out / 'accuracy.csv'}; misses and false positives in "
              f"{out / 'accuracy_errors.csv'}")


if __name__ == "__main__":
    main()
