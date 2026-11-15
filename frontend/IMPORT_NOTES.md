# Frontend import notes

- **Source:** Lovable export `claimcheck-truth-compass`, supplied by Christopher Dowden. First imported 2026-11-13, then replaced the same day with the aligned export (`claimcheck-truth-compass1.zip`). Replaced again on 2026-11-14 with the API-connected export (`claimcheck-truth-compass_1.zip`). Each import was unchanged; `node_modules` and build output were excluded.
- **What it is:** the ClaimCheck reviewer app (TanStack Start, React, TypeScript) on synthetic data. It now calls the Python engine through the ClaimCheck API at `https://claimcheck-api.vercel.app` (`src/lib/api.ts`). The in-browser rules (`src/lib/demo-engine.ts`) are kept only as a fallback when the API is unreachable, with an amber status shown. See `docs/FRONTEND_HANDOFF.md`.

## Connected to the API (2026-11-14, Lovable prompts 0–7)

- **Data:** reads `/api/health`, `/api/sample` and `POST /api/analyze`. Overview, Exception Queue, Review, Analytics, Accuracy and AI Review all use one shared API result.
- **Accuracy:** shows the API's own evaluation unchanged. The browser scoring and reference panel appear only on fallback.
- **AI:** live Claude review runs only when the visitor asks for it and health reports AI as available. The app shows the mode, model, time, cache status and every API note, including rules-only fallbacks when limits are hit. The AI key stays on the server; the front end holds no keys or secrets.
- **Settings:** adds a detection-engine choice (Python or browser), API health and limits, and a connection test.
- **Tests:** added `api`, `store`, `connected-app`, `accuracy`, `ai-review` and `analysis-setup` tests, with `fetch` mocked.

### Verified at import (Bun 1.4.4, frozen `bun.lock`)

- `vitest run`: 50/50 passed (8 files)
- `tsc --noEmit`: clean
- `eslint .`: 0 errors, 10 warnings (same `react-refresh/only-export-components` hints as before)
- `prettier --check .`: clean
- Production build succeeds
- The published app (https://claimcheck-truth-compass.lovable.app) shows "Python engine · live", and its numbers match the API exactly:
  - 1,937 lines and 100 flagged (High 43, Medium 40, Low 17), $15,573.40 flagged
  - rule level: 109 planted, 103 detected, 99 TP, 4 FP, 10 missed (96.1% precision, 90.8% recall)
  - line level: 106 planted lines, 96 found, 4 clean lines flagged (96.0% precision, 90.6% recall)
- No `sk-ant`, `ANTHROPIC` or `XAI_API` strings. The only network targets are the API and Google Fonts.

## Earlier import history

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

## Other changes in the aligned export

- `@lovable.dev/vite-tanstack-config` 2.26.5 → 2.27.1 (Lovable tooling), with the matching `bun.lock` update
- `.lovable/north-star/north-star.md` added by Lovable (product goal note; not app code)

## Controls

No secrets in the front end. The only network calls are to the ClaimCheck API and Google Fonts. Lovable hosts the published app; nothing else is deployed from `frontend/`.
