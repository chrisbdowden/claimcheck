# ClaimCheck: AI Expense Exception Detector

ClaimCheck reviews every line of an expense export instead of a sample. It checks each line against 10 duplicate and policy rules, ranks the exceptions by severity, and uses the Claude API to write a plain-English reason for each flag, so a reviewer can act without re-reading the report.

> Demo on synthetic data. No real employee or employer data is used.

![ClaimCheck screenshot](docs/screenshot.png) <!-- add after deploying -->

## Results on the synthetic test set

Offline mode (rules + keyword description check, no API key), 1,937 synthetic lines, 109 planted exceptions:

| Rule | Planted | Found | False positives | Missed |
| --- | ---: | ---: | ---: | ---: |
| Exact duplicate | 12 | 12 | 4 | 0 |
| Near duplicate | 13 | 10 | 0 | 3 |
| Cross-employee duplicate | 8 | 8 | 0 | 0 |
| Over policy limit | 12 | 12 | 0 | 0 |
| Missing receipt | 12 | 12 | 0 | 0 |
| Split transaction | 13 | 11 | 0 | 2 |
| Round-number amount | 10 | 10 | 0 | 0 |
| Weekend / holiday | 10 | 10 | 0 | 0 |
| Blocked category | 6 | 6 | 0 | 0 |
| Description mismatch | 13 | 8 | 0 | 5 |
| **All rules** | **109** | **99 (91% recall)** | **4 (96% precision)** | **10** |

- 4 of 1,831 clean lines wrongly flagged; full review in about 1 second.
- The misses and false positives are designed into the test set:
  - **3 near duplicates** are 3-5% apart, outside the 2% tolerance.
  - **2 split lines** are spread across two days; the rule checks one day at a time.
  - **5 description mismatches** are personal spend written in business words ("Family dinner while on vacation"). The keyword check can't see these; the Claude AI step is built to catch them.
  - **4 false positives** are same-fare round-trip car rides on one day (legitimate, but identical to a duplicate). A reviewer clears these in seconds.

Run with an `ANTHROPIC_API_KEY` to score AI mode; update this table with those numbers.

## How it works

```
Expense CSV + policy CSV
  -> rules engine (Python, pandas)      rules 1-9, deterministic and repeatable
  -> AI review (Claude API)             rule 10 + a one-sentence reason per flag
  -> exception queue (Streamlit)        sorted by severity, then amount
  -> CSV export + accuracy report
```

| # | Rule | Flags | Severity |
| --- | --- | --- | --- |
| 1 | Exact duplicate | Same employee, merchant, date and amount (later line flagged) | High |
| 2 | Near duplicate | Same employee and merchant, amount within 2%, dates within 3 days | High |
| 3 | Cross-employee duplicate | Same merchant, date and amount claimed by two employees (meals, client entertainment, ground transport only; group hotel rates are normal) | Medium |
| 4 | Over policy limit | Amount above the category limit | Medium |
| 5 | Missing receipt | Over the receipt threshold with no receipt | Medium |
| 6 | Split transaction | 2+ lines, same employee/merchant/day, each under the limit, together over it | High |
| 7 | Round-number amount | Whole-dollar amount at or above $100 | Low |
| 8 | Weekend / holiday | Software, office supplies or client entertainment on a weekend or holiday | Low |
| 9 | Blocked category | Casino, liquor store, gift card or spa merchants | High |
| 10 | Description mismatch | Description doesn't fit a business expense in that category (AI; keyword check offline) | Medium |

All limits and lists live in `data/policy.csv` and can be edited in Excel.

## Run it locally

```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python -m src.generate_data        # builds data/expenses.csv and data/policy.csv (fixed seed)
python -m src.pipeline --no-ai     # offline run: exception queue + accuracy report in output/
python -m pytest -q                # 18 tests
streamlit run app.py               # the web app
```

### Turn on the AI step

```bash
export ANTHROPIC_API_KEY=sk-ant-...    # Windows: set ANTHROPIC_API_KEY=...
python -m src.pipeline                  # AI mode
```

For the app, copy `.streamlit/secrets.toml.example` to `.streamlit/secrets.toml` and add your key. The model defaults to `claude-haiku-5-5`; override it with the `CLAIMCHECK_MODEL` environment variable. Responses are cached in `output/ai_cache.json`, so re-runs are free.

## Deploy a public demo (free)

1. Push this folder to a public GitHub repo (the `.gitignore` keeps your key out).
2. Go to share.streamlit.io, choose **New app**, pick the repo and set the main file to `app.py`.
3. Under **Advanced settings > Secrets**, paste `ANTHROPIC_API_KEY = "sk-ant-..."`. Leave it out to run the demo in offline mode at no cost.
4. Set a monthly spend limit on your Anthropic key before sharing the link.

## Project layout

```
app.py                  Streamlit app
src/policy.py           policy file loading and defaults
src/rules.py            rules 1-9 and the exception queue
src/ai_review.py        Claude API step (reasons + rule 10), keyword fallback, cache
src/pipeline.py         end-to-end run and CLI
src/evaluate.py         precision/recall against the planted answer key
src/generate_data.py    synthetic data with planted exceptions and lookalikes
tests/                  rule tests + AI step tested with a fake client
data/                   expenses.csv, policy.csv
output/                 exceptions.csv, accuracy.csv, accuracy_errors.csv
```

## Upload your own file

Required columns: `line_id, report_id, employee_id, expense_date, merchant, category, amount_usd, receipt_attached, description`. Optional: `merchant_type` (needed for the blocked-category rule), `planted_issue` (an answer key; turns on the Accuracy tab). Row order is treated as submission order: the earlier of two duplicates is the original.

## What I'd do next

- Connect to an expense platform export format (Concur, Expensify or Ramp).
- Add receipt image checks (date and amount on the receipt vs the claim).
- Track flags over time by employee and merchant.
- Let reviewers mark flags as cleared, and use that to tune rules.

## About

Built by Christopher Dowden with AI-assisted development (Claude Code). I designed the rules from my accounts payable and T&E review experience, directed the build and validated the results. All data is synthetic.
