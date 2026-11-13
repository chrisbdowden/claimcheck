# Frontend import notes

- **Source:** Lovable export `claimcheck-truth-compass`, supplied by Christopher Dowden. First imported 2026-11-13; replaced the same day with the aligned export (`claimcheck-truth-compass1.zip`) after six alignment changes made in Lovable. Imported unchanged; `node_modules` and build output excluded.
- **What it is:** a front-end prototype (TanStack Start, React, TypeScript) on synthetic data. Its rules run in the browser (`src/lib/demo-engine.ts`); AI is simulated. It does not call the Python engine. See `docs/FRONTEND_HANDOFF.md`.

## Alignment with the Python engine (PR #6)

Applied in Lovable and checked independently against the code:

1. Rule IDs `over_policy_limit` → `over_limit` and `round_number` → `round_amount`; saved-data key bumped to `claimcheck-demo-v2`. No old IDs remain in code (one mention in the handoff doc's change log).
2. Split rule groups by employee + merchant + date, excludes duplicates, and requires every line within the limit, a total over it and non-identical amounts.
3. Description check uses the Python engine's keyword lists verbatim and flags a line when none of its own category's words appear. Two clean descriptions were reworded.
4. Holiday list uses Juneteenth (2026-06-19) instead of 2026-07-03, matching `data/policy.csv`.
5. The accuracy page separates the prototype's in-browser numbers from the Python engine's CI-reproduced reference results.
6. Prettier formatting applied.

## Verified at import (Bun 1.4.4, frozen `bun.lock`)

- `vitest run`: 15/15 passed
- `tsc --noEmit`: clean
- `eslint .`: 0 errors, 10 warnings (all `react-refresh/only-export-components`; fast-refresh hints, not defects)
- `prettier --check .`: clean
- Production build succeeds; all 11 screens load in headless Chrome with no page errors
- Numbers recomputed by running the engine directly on the synthetic dataset: 1,937 lines, 112 flagged (46 High, 45 Medium, 21 Low), $19,612.76 flagged; 109 planted, 105 found, 7 false positives, 4 missed (93.8% precision, 96.3% recall). These match the Overview and Detection Accuracy screens.

These numbers come from the prototype's own synthetic dataset and are not comparable to the Python engine's (1,937 lines, 109 planted, 99 found, 4 false positives).

## Other changes in this export

- `@lovable.dev/vite-tanstack-config` 2.26.5 → 2.27.1 (Lovable tooling), with the matching `bun.lock` update
- `.lovable/north-star/north-star.md` added by Lovable (product goal note; not app code)

## Controls

No secrets, no backend, no network calls except Google Fonts, no deployment.
