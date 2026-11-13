# Frontend import notes

- **Source:** Lovable export `claimcheck-truth-compass.zip`, supplied by Christopher Dowden on 2026-11-13. Imported unchanged; `node_modules` and build output excluded.
- **What it is:** a front-end prototype (TanStack Start, React, TypeScript) on synthetic data. Its rules run in the browser (`src/lib/demo-engine.ts`); AI is simulated. It does not call the Python engine. See `docs/FRONTEND_HANDOFF.md`.
- **Verified at import (Bun 1.4.4, frozen `bun.lock`):** 13/13 tests pass, `tsc --noEmit` passes, production build succeeds, all 11 screens load with no page errors. `eslint` reports 787 prettier formatting errors and 10 warnings (formatting only).
- **Known differences from the Python engine (PR #6):** rule IDs `over_policy_limit`/`round_number` vs `over_limit`/`round_amount`; split rule groups by category instead of merchant; description check flags only cross-category words; holiday list has 2026-07-03 instead of Juneteenth (2026-06-19). Fixes are specified in `ClaimCheck_Lovable_Alignment_Prompts.md`, to be applied in Lovable and re-exported.
- **Controls:** no secrets, no backend, no network calls except Google Fonts, no deployment.
