# ClaimCheck — Frontend Integration Handoff (CLAIMCHECK-UI-001)

Status: interactive frontend prototype on synthetic data. Not connected to the Python engine, and no code has been pushed to github.com/chrisbdowden/claimcheck. Any integration needs separate approval and planning.

## 1. Screen and component inventory
| Route | Screen | Key components |
|---|---|---|
| `/` | Overview | `Kpi`, severity donut, rule bar, weekly line chart, category bar, high-priority table, Controls Insights, `ExceptionDrawer` |
| `/analysis` | Expense Analysis | Source picker, CSV drop zone, validation report, staged progress, analysis summary |
| `/exceptions` | Exception Queue | 8 filters + search, sortable table, row action menu, pagination, CSV export, `ExceptionDrawer` |
| `/review` | Review Workspace | Worklist (Open/Escalated/All), `ExceptionDetail` + evidence, decision panel (status, notes, history) |
| `/analytics` | Analytics | 4 filters, 8 charts, simulated review time, visible-rows CSV export |
| `/accuracy` | Detection Accuracy | Measured metrics, rule table, transaction summary, Illustrative Reference panel, methodology |
| `/policy` | Policy Configuration | Limits, thresholds, blocked types, weekend/shared lists, holidays, change history, reset, CSV export |
| `/ai-review` | AI Review | Provider selector (simulated), 3-way explanation comparison, verification steps, governance |
| `/activity` | Activity & Audit Trail | Filterable event log, CSV export |
| `/settings` | Settings | Org, display (light/dark), defaults, AI, notifications, privacy, about |
| `/rules` | Rule Library | 10 rule cards (9 deterministic + 1 heuristic/AI) |

Shared: `components/layout/AppShell` (collapsible sidebar, mobile sheet, top bar), `components/shared/*` (badges, panels, info tips), `components/exceptions/ExceptionDrawer`.

## 2. Data models (`src/lib/types.ts`)
- `ExpenseLine`: line_id, report_id, employee_id, expense_date (YYYY-MM-DD), merchant, merchant_type, category, amount_usd, receipt_attached, description, planted_issue? (evaluation only)
- `Finding`: rule (RuleId), severity, explanation, relatedLineIds[]
- `FlaggedLine`: line, findings[], severity (highest finding)
- `Policy`: categoryLimits, receiptThreshold, roundNumberThreshold, blockedMerchantTypes, weekendRestrictedCategories, sharedExpenseCategories, holidays[]
- `HistoryEvent`: id, timestamp, user, type, lineId?, previousStatus?, newStatus?, note?
- `ReviewStatus`: New | In Review | Cleared | Escalated

## 3. Proposed mock API interfaces
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
- The prototype's `src/lib/demo-engine.ts` is a browser re-implementation of the documented rules and can serve as a contract reference, not as ground truth.

## 5. State-management assumptions
- One React context (`src/lib/store.tsx`) holds policy, review statuses, notes, events, date range, provider and settings; persisted to `localStorage` key `claimcheck-demo-v1`.
- Findings are derived (memoized) from lines + policy, so every KPI and chart reconciles. With a backend, swap this for TanStack Query against the endpoints above.
- Initial review statuses and history are seeded deterministically from line IDs.

## 6. UI behaviors that need backend integration
Real analysis runs and progress; persisted review decisions with authenticated users and roles; versioned, approved policy changes; tamper-evident audit log; receipt storage and viewing; real AI provider calls with logging and human-review gating; server-side CSV ingestion with data governance; notifications/email.

## 7. Prototype vs implemented functionality
| Area | Prototype | Not implemented |
|---|---|---|
| Detection | Browser ruleset on synthetic data | Python engine execution |
| Upload | Local parse + validation | Server upload, persistence |
| Review | Local status/notes | Approvals, payment blocking, routing |
| Policy | Local edits, history | Production policy changes |
| AI | Templated simulated text | Any model call or API key |
| Audit | Local event list | Tamper-proof audit store |
| Auth | Mock profile | Sign-in, users, roles |

## 8. Recommended UX improvements
Bulk actions in the queue; saved filter views; keyboard shortcuts (J/K, C/E) in the Review Workspace; side-by-side receipt viewer for duplicates; reviewer assignment and SLA timers; policy-change impact diff before saving; per-rule false-positive feedback loop; drill-down from any chart into a pre-filtered queue.

## Known limitations
- Accuracy figures are measured on designed synthetic data only (112 rule detections, 102 true positives, 10 false positives, 7 misses at default policy).
- The five 2026 holidays are assumed (New Year's Day, MLK Day, Presidents' Day, Memorial Day, Independence Day observed); please confirm against the Grok specification.
- Uploaded CSV results are shown in the analysis summary only; the queue, dashboard and review screens stay on the bundled dataset.
- Receipts are placeholders.
