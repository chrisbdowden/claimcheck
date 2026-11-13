# Phase 0 — Execution and approval controls

- Scope: Phase 0 and Phase 1 only; no Phase 2 implementation.
- Data: synthetic only; no external or employer records.
- Network: no inference calls, no deployment, no external push.
- Credentials: none required; secrets example is nonfunctional and real secrets are gitignored.
- Deterministic policy: explicit CSV schema; input validation and reproducible output.
- Verification: run Phase 1 tests and print 25-row policy.
- Approval gate: STOP after Phase 1; request explicit authorization for Phase 2.
- Engineering learning: read `src/policy.py`, explain the dataclass and parsing, change one policy value in a temporary CSV, and rerun tests.
- Deferred: rules engine, expense generator, AI integration, evaluation, Streamlit UI, hosting, and publishing.
