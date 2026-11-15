# ClaimCheck — Frontend Integration Handoff (CLAIMCHECK-UI-001)

Status: Connected to the ClaimCheck API; browser engine as fallback. Synthetic data only. The owner approved this connection; no code has been pushed to github.com/chrisbdowden/claimcheck.

## 1. Screen and component inventory

| Route         | Screen                 | Key components                                                                                                                                            |
| ------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`           | Overview               | `Kpi`, severity donut, rule bar, weekly line chart, category bar, high-priority table, Controls Insights, `ExceptionDrawer`                               |
| `/analysis`   | Expense Analysis       | Source picker, CSV drop zone, validation report, staged progress, analysis summary                                                                        |
| `/exceptions` | Exception Queue        | 8 filters + search, sortable table, row action menu, pagination, CSV export, `ExceptionDrawer`                                                            |
| `/review`     | Review Workspace       | Worklist (Open/Escalated/All), `ExceptionDetail` + evidence, decision panel (status, notes, history)                                                      |
| `/analytics`  | Analytics              | 4 filters, 8 charts, simulated review time, visible-rows CSV export                                                                                       |
| `/accuracy`   | Detection Accuracy     | API evaluation metrics, rule table, transaction summary, reference panel only on fallback, methodology                                                    |
| `/policy`     | Policy Configuration   | Limits, thresholds, blocked types, weekend/shared lists, holidays, change history, reset, CSV export                                                      |
| `/ai-review`  | AI Review              | API reasons, live Claude/model labels, description findings, same-dataset AI rerun, verification steps, governance; simulated comparison only on fallback |
| `/activity`   | Activity & Audit Trail | Filterable event log, CSV export                                                                                                                          |
| `/settings`   | Settings               | Detection engine selector, API health/limits, connection test, org, display, defaults, AI, notifications, privacy, about                                  |
| `/rules`      | Rule Library           | 10 rule cards (9 deterministic + 1 heuristic/AI)                                                                                                          |

Shared: `components/layout/AppShell` (collapsible sidebar, mobile sheet, top bar), `components/shared/*` (badges, panels, info tips), `components/exceptions/ExceptionDrawer`.

## 2. Data models (`src/lib/types.ts`)

- `ExpenseLine`: line_id, report_id, employee_id, expense_date (YYYY-MM-DD), merchant, merchant_type, category, amount_usd, receipt_attached, description, planted_issue? (evaluation only)
- `Finding`: rule (RuleId), severity, explanation, relatedLineIds[]
- `FlaggedLine`: line, findings[], severity (highest finding), reason? (preserved API explanation)
- `Policy`: categoryLimits, receiptThreshold, roundNumberThreshold, blockedMerchantTypes, weekendRestrictedCategories, sharedExpenseCategories, holidays[]
- `HistoryEvent`: id, timestamp, user, type, lineId?, previousStatus?, newStatus?, note?
- `ReviewStatus`: New | In Review | Cleared | Escalated

## 3. Connected to the Python engine

Base URL: `https://claimcheck-api.vercel.app`. The typed browser client is `src/lib/api.ts`; no API keys, secrets or tokens are stored in the front end.

Endpoints used by the connected app:

- `GET /api/health`: version, AI availability/provider/model, limits and rule names/severities; also used by Settings' Test connection.
- `GET /api/sample`: bundled synthetic lines, employee names and default policy.
- `POST /api/analyze`: `{ source: "bundled" | "upload", policy, use_ai, lines? }`; returns findings/reasons, evaluation, summary, model usage, response time, cache status and notes. Upload receipts are booleans and upload size is checked against health `max_lines`.
- `GET /api/policy`: supported by the typed client's `getPolicy()`; current startup reads policy from `/api/sample`, so this endpoint is not requested by the current screens.

TanStack Query starts the initial sample/health/analysis after hydration. The store commits lines and analysis together; explicit upload results then drive Overview, queue, review, analytics and accuracy. Policy saves debounce 500 ms, analyze the active source, and retain previous results until success. Python accuracy uses `analysis.evaluation` unchanged, including rule order/labels and reported precision/recall. `planted_issue` is evaluation-only and may carry several rules; each line-rule pair is scored.

The API client has a 60-second timeout. Initial API errors or analysis failures switch the whole active dataset to the browser engine for the session with an explicit amber status and error details; the persisted Python preference is retained. Selecting Python retries a failed startup. Upload validation (422) stays in the existing validation report without discarding the last Python results. Settings' connection test reports failure without changing the detection engine. Manual browser selection is saved separately.

Live AI runs only when requested and health reports availability. Analysis displays returned mode/model, seconds, cached status and every API note; limits may produce a rules-only fallback. AI Review displays the API `reason` and description-mismatch explanations, retaining human verification and governance. Multi-provider comparisons and simulated progress/text remain only on the browser path.

### Future production API concepts (not implemented)

```
POST /api/analyses            {source: "bundled"|"upload", lines?: ExpenseLine[], policy_version}
                              -> {analysis_id, status}
GET  /api/analyses/:id        -> {status, progress, stage, summary}
GET  /api/analyses/:id/findings?severity&rule&category&employee&merchant&status&from&to&min&max&q&sort&page
                              -> {rows: FlaggedLine[], total, total_amount}
GET  /api/lines/:line_id      -> {line, findings, related: ExpenseLine[], history: HistoryEvent[]}
PATCH /api/lines/:line_id/review  {status, note?}  -> HistoryEvent
POST /api/lines/:line_id/notes    {text}           -> HistoryEvent
GET/PUT /api/policy           Policy (+ version, changed_by)
GET  /api/evaluation          {per_rule[], rule_totals, tx_totals}
GET  /api/activity?type&from&to
POST /api/explanations        {line_id, provider} -> {text, steps[], provider, simulated:boolean}
```

## 4. Expected Python pipeline inputs/outputs

- Input: CSV with the 10 required columns (planted_issue optional, never a detection input) + policy JSON.
- Output per line: zero or more `{rule, severity, explanation, related_line_ids}`; evaluation report with planted/detected/TP/FP/missed per rule and transaction-level totals.
- `src/lib/demo-engine.ts` is an offline fallback only, not ground truth; the Python API is authoritative for connected results.

## 5. State-management assumptions

- One React context (`src/lib/store.tsx`) holds policy, review statuses, notes, events, date range, provider and settings; persisted to `localStorage` key `claimcheck-demo-v2`.
- Python findings and evaluation come from the atomic API snapshot. Browser findings are derived from the fallback lines + policy. No browser detector runs over Python results.
- Analysis snapshots and uploaded rows are session-only, not persisted. Reload loads the bundled source again. The API is stateless; review statuses, notes and events remain in localStorage.
- Initial review statuses and history are seeded deterministically from line IDs.

## 6. UI behaviors that need backend integration

Remaining production work: persisted review decisions with authenticated users and roles; versioned, approved policy changes; tamper-evident audit log; receipt storage and viewing; durable AI request logging; governed real-data ingestion; notifications/email. Python analysis and optional live Claude calls are implemented for synthetic data; stages complete on the real request, not timers.

## 7. Prototype vs implemented functionality

| Area      | Implemented now                                                                                                 | Not implemented                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Detection | Python API on synthetic data; explicitly labeled browser fallback                                               | Production validation on governed real data                                           |
| Upload    | Local parsing/validation, API limit checks, stateless Python analysis, results shared across screens            | Persistent uploaded datasets and governed real-data ingestion                         |
| Review    | Local status/notes                                                                                              | Approvals, payment blocking, routing                                                  |
| Policy    | Local edits/history and Python reanalysis of the active dataset                                                 | Production policy approvals/versioning                                                |
| AI        | Live Claude calls through the API when available/requested; API reasons, model labels, notes and rules fallback | Durable model-call audit and production AI validation; credentials remain server-side |
| Audit     | Local event list                                                                                                | Tamper-proof audit store                                                              |
| Auth      | Mock profile                                                                                                    | Sign-in, users, roles                                                                 |

## 8. Recommended UX improvements

Bulk actions in the queue; saved filter views; keyboard shortcuts (J/K, C/E) in the Review Workspace; side-by-side receipt viewer for duplicates; reviewer assignment and SLA timers; policy-change impact diff before saving; per-rule false-positive feedback loop; drill-down from any chart into a pre-filtered queue.

## Alignment with the Python engine

The browser fallback rules were aligned with the Python engine as of PR #6; connected results now come directly from the API:

1. Rule IDs renamed to the engine's output codes: `over_policy_limit` → `over_limit`, `round_number` → `round_amount` (saved-data key bumped to `claimcheck-demo-v2`).
2. Split transaction groups by employee + merchant + date (not category), excludes duplicates, and flags only when every line is within the limit, the total exceeds it, and amounts are not all identical.
3. Description mismatch uses the engine's offline `CATEGORY_KEYWORDS` lists: flagged when the description contains none of its category's keywords.
4. Holiday calendar matches `data/policy.csv`: July 3 replaced by Juneteenth (2026-06-19).

## Final measured Python results

Read directly from the app with Python engine active, bundled synthetic data, default policy, Jan 1–Jun 30, 2026, rules-only analysis, on November 15, 2026:

| Overview metric        | Displayed value                                                |
| ---------------------- | -------------------------------------------------------------- |
| Expense lines reviewed | 1,937                                                          |
| Transactions flagged   | 100                                                            |
| Rule-level findings    | 103                                                            |
| Dollars flagged        | $15,573.40                                                     |
| High / Medium / Low    | 43 / 40 / 17                                                   |
| Exception rate         | 5.2%                                                           |
| Review completion      | 49% (49 of 100 cleared or escalated; synthetic review history) |

| Detection Accuracy metric                         | Rule-level | Transaction-level |
| ------------------------------------------------- | ---------- | ----------------- |
| Planted exceptions / planted lines                | 109        | 106               |
| Findings / flagged lines                          | 103        | 100               |
| True positives / correctly flagged lines          | 99         | 96                |
| False positives / clean lines incorrectly flagged | 4          | 4                 |
| Missed exceptions / planted lines missed          | 10         | 10                |
| Precision                                         | 96.1%      | 96.0%             |
| Recall                                            | 90.8%      | 90.6%             |

These are synthetic evaluation results, not production performance. Counts can change with policy, source or live AI. The rule-level and transaction-level planted counts differ because one line may carry multiple labels.

## Known limitations

- The 2026 holiday calendar matches the Python policy file: New Year's Day, MLK Day, Presidents' Day, Memorial Day, Juneteenth.
- Python upload results drive every screen until reload; browser-fallback upload previews remain local to Analysis as before.
- Review decisions and history are browser-only; demo review history is seeded deterministically, not real reviewer activity.
- AI availability and request limits are server-controlled; the UI displays returned fallback notes.
- Receipts are placeholders.
