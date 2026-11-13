"""Accuracy scoring against the planted answer key.

Scores at the (line, rule) level: a line planted as exact_duplicate counts as
found only if the tool flags that line with exact_duplicate.

    python -m src.evaluate      # runs the pipeline offline and prints the report
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from .rules import RULE_LABELS, RULE_ORDER


@dataclass
class Report:
    overall: dict
    lines: dict
    by_rule: pd.DataFrame
    errors: pd.DataFrame


def _pairs(ids, codes) -> set[tuple[str, str]]:
    out = set()
    for lid, c in zip(ids, codes):
        if isinstance(c, str) and c.strip():
            out.update((str(lid), r) for r in c.split("|"))
    return out


def _ratio(a: int, b: int) -> float | None:
    return round(a / b, 4) if b else None


def evaluate(raw: pd.DataFrame, exceptions: pd.DataFrame) -> Report:
    raw = raw.copy()
    raw["line_id"] = raw["line_id"].astype(str)
    planted = _pairs(raw["line_id"], raw["planted_issue"].fillna(""))
    flagged = _pairs(exceptions["line_id"], exceptions["rule_codes"]) if len(exceptions) else set()

    rows = []
    for r in RULE_ORDER:
        p = {x for x in planted if x[1] == r}
        f = {x for x in flagged if x[1] == r}
        tp = len(p & f)
        rows.append({
            "rule": RULE_LABELS[r],
            "planted": len(p),
            "flagged": len(f),
            "true_positives": tp,
            "false_positives": len(f - p),
            "missed": len(p - f),
            "precision": _ratio(tp, len(f)),
            "recall": _ratio(tp, len(p)),
        })
    by_rule = pd.DataFrame(rows)
    tp = len(planted & flagged)
    overall = {
        "planted": len(planted),
        "flagged": len(flagged),
        "true_positives": tp,
        "false_positives": len(flagged - planted),
        "missed": len(planted - flagged),
        "precision": _ratio(tp, len(flagged)),
        "recall": _ratio(tp, len(planted)),
    }
    total = pd.DataFrame([{"rule": "All rules", **overall}])
    by_rule = pd.concat([by_rule, total], ignore_index=True)

    planted_lines = {x[0] for x in planted}
    flagged_lines = {x[0] for x in flagged}
    lines = {
        "lines_total": len(raw),
        "lines_planted": len(planted_lines),
        "lines_flagged": len(flagged_lines),
        "clean_lines_flagged": len(flagged_lines - planted_lines),
        "planted_lines_found": len(planted_lines & flagged_lines),
    }

    info = raw.set_index("line_id")
    detail = exceptions.set_index("line_id")["details"].to_dict() if len(exceptions) else {}
    errs = []
    for kind, pairs in (("false positive", flagged - planted), ("missed", planted - flagged)):
        for lid, r in sorted(pairs):
            row = info.loc[lid]
            errs.append({
                "type": kind,
                "line_id": lid,
                "rule": RULE_LABELS[r],
                "employee_id": row["employee_id"],
                "expense_date": row["expense_date"],
                "merchant": row["merchant"],
                "category": row["category"],
                "amount_usd": row["amount_usd"],
                "description": row["description"],
                "planted_issue": row["planted_issue"] if isinstance(row["planted_issue"], str) else "",
                "tool_detail": detail.get(lid, ""),
            })
    errors = pd.DataFrame(errs)
    return Report(overall, lines, by_rule, errors)


def print_report(rep: Report) -> None:
    t = rep.by_rule.copy()
    for c in ("precision", "recall"):
        t[c] = t[c].map(lambda v: "-" if v is None or pd.isna(v) else f"{v:.0%}")
    print("\nAccuracy vs planted answer key")
    print(t.to_string(index=False))
    l = rep.lines
    print(f"\nClean lines wrongly flagged: {l['clean_lines_flagged']} of "
          f"{l['lines_total'] - l['lines_planted']:,}")
    if len(rep.errors):
        print("\nMisses and false positives to review:")
        cols = ["type", "line_id", "rule", "merchant", "amount_usd", "description"]
        print(rep.errors[cols].to_string(index=False))


if __name__ == "__main__":
    from pathlib import Path

    from .pipeline import run
    from .policy import Policy

    root = Path(__file__).resolve().parent.parent
    raw = pd.read_csv(root / "data" / "expenses.csv", dtype={"line_id": str})
    res = run(raw, Policy.from_csv(root / "data" / "policy.csv"), use_ai=False)
    print_report(evaluate(raw, res.exceptions))
