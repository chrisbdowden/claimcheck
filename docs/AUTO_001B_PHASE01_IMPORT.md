# AUTO-001B Phase 0-1 import

The Phase 0-1 archive was copied onto this branch unchanged. Phase 2 is not included.

## Required correction

`.github/workflows/ci.yml` now sets both `XAI_API_KEY` and `ANTHROPIC_API_KEY` to empty strings for the whole test job. The previous workflow blanked only `ANTHROPIC_API_KEY` on the pytest step. No model call is made.

## Local verification before CI

- Python 3.11.2
- `python -m pytest -q`: 7 passed in 0.31s
- `default_policy().to_frame()` has 25 rows
- `data/policy.csv` round-trips equal to that frame
- No tracked `.env`, `secrets.toml`, private key, or employer record
- `.streamlit/secrets.toml.example` contains a non-functional placeholder, not a key

## Documented gaps, not changed

- The empty `output/` directory from the archive is not stored in git.

Later remediation is recorded in `docs/PHASE01_REMEDIATION.md`. The dual-provider dependency and placeholder lines are updated there.

## Not in this pull request

No merge, no change to `main`, no Phase 2 rules engine, no deployment, and no paid inference.
