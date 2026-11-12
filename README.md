# ClaimCheck — Phase 0–1 Foundation

**Status:** Phase 0 and Phase 1 only. No rules engine, AI calls, real expense data, or deployment.

ClaimCheck is a synthetic-data expense-exception detection portfolio project. The current deliverable is a configurable long-format CSV policy, Python `Policy` dataclass, and unit tests. This policy is an illustrative demonstration, not an employer policy or certified compliance control.

## Reproduce

```bash
python -m pip install -r requirements.txt
python -m pytest -q
python -c "from src.policy import default_policy; print(default_policy().to_frame().to_string(index=False))"
```

## Controls

- Synthetic data only; no real employer, employee, or vendor records.
- Do not add secrets to source control. `.streamlit/secrets.toml` is ignored.
- No live model inference or external deployment authorized.
- Phase 2 requires separate approval.

## Policy schema

`setting,key,value`, one policy entry per row. `category_limit` has category in `key` and amount in `value`; numeric thresholds have blank keys; category sets and ISO holidays have a key and blank value. Unknown settings, duplicate entries, invalid dates, and negative amounts are rejected.

## Learning checkpoint

Explain what a Python dataclass is, why `from_csv` delegates to `from_frame`, and how to modify the Meals limit in a policy CSV and verify the round trip.
