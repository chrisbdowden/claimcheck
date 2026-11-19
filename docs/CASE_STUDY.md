# ClaimCheck: Applying AI to Expense Exception Review

**Finance AI transformation · Founder-directed, AI-assisted product development**
Christopher Dowden · [github.com/chrisbdowden/claimcheck](https://github.com/chrisbdowden/claimcheck)

## The business problem

Finance teams review large volumes of expense claims for duplicates, policy breaks, missing receipts and improper reimbursements. Most teams review a sample, so exceptions slip through.

I worked this problem by hand for years in accounts payable and expense operations. At J.P. Morgan Private Bank I identified duplicate and suspicious expense claims during payment and reimbursement review. At HeartShare I reviewed up to 300 SAP Concur expense reports per quarter, including exception handling.

## What I built

ClaimCheck reviews every line of an expense export, not a sample. It flags exceptions, ranks them by severity, and writes a plain-English reason for each flag so a reviewer can act quickly.

I specified ten detection rules from my AP and T&E experience:

| # | Rule | Method |
| --- | --- | --- |
| 1 | Exact duplicate | Deterministic |
| 2 | Near duplicate (amount within 2%, dates within 3 days) | Deterministic |
| 3 | Cross-employee duplicate | Deterministic |
| 4 | Over policy limit | Deterministic |
| 5 | Missing receipt | Deterministic |
| 6 | Split transaction | Deterministic |
| 7 | Round-number amount | Deterministic |
| 8 | Weekend or holiday spend | Deterministic |
| 9 | Blocked merchant category | Deterministic |
| 10 | Description doesn't fit the expense | AI review (keyword check offline) |

Rules 1–9 are deterministic Python checks, so results are repeatable. An optional LLM step (Claude) handles rule 10 and writes the reason for each flag. Policy limits live in an editable CSV.

## My role

AI development tools wrote and debugged the code. My responsibilities were:

- product direction and the business problem definition
- rule design, thresholds and severity, drawn from my AP and expense experience
- requirements and acceptance criteria
- evaluation design: a synthetic dataset with a planted answer key, scored for precision and recall
- governance: reviewing and approving every change before merge

## Evaluation results

Test set: 1,937 synthetic expense lines. 106 lines carry planted issues, for 109 rule-level exceptions (some lines have more than one).

| Mode | Recall (exceptions found) | Precision (flags that were real) | Clean lines wrongly flagged |
| --- | ---: | ---: | ---: |
| Offline (deterministic rules + keyword check) | 91% (99 of 109) | 96% | 4 of 1,831 |
| AI-assisted (Claude review for rule 10) | 95% (104 of 109) | 93% | 5 of 1,831 |

The misses are understood and documented: near duplicates just outside the 2% tolerance, split transactions spread across two days, and personal spend written in business language, which the AI step catches and the keyword check does not. The false positives are same-day round-trip car fares that look like duplicates.

**Limits of these results.** All data is synthetic. The AI-assisted figures come from one documented run on November 14, 2026. They are not reproduced in CI, which never calls a paid model. These are test-set results, not production accuracy.

## Governance

- Changes reach `main` only through pull requests I review and approve; there is no auto-merge.
- CI runs the offline test suite on every pull request, with API keys blanked.
- Dependencies are hash-pinned; CI scans tracked files for credentials.
- The live API enforces per-visitor and hourly AI limits and falls back to rules only when a limit is hit.
- ClaimCheck flags potential exceptions for human review. It does not decide misconduct or approve payments.

## Current maturity

ClaimCheck is a public demonstration project. It has not established production accuracy, customer adoption, measured cost savings, or performance on real company data.

## What it shows

Finance domain knowledge is what makes an AI workflow useful: knowing which exceptions matter, how they hide, and how a reviewer needs them presented. ClaimCheck combines that knowledge with structured rules, measured evaluation, human oversight and controlled change management.

## Next steps

- Support real expense-platform export formats (Concur, Expensify, Ramp).
- Check receipt images against claimed date and amount.
- Let reviewers clear flags and use those decisions to tune the rules.
- Re-run the AI evaluation several times and report the spread.
