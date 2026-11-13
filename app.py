"""ClaimCheck - Streamlit app.  Run: streamlit run app.py"""
from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
import streamlit as st

from src.evaluate import evaluate
from src.pipeline import run
from src.policy import Policy
from src.rules import RULE_LABELS, RULE_ORDER, for_export

ROOT = Path(__file__).resolve().parent
SAMPLE = ROOT / "data" / "expenses.csv"
POLICY_FILE = ROOT / "data" / "policy.csv"

st.set_page_config(page_title="ClaimCheck - AI Expense Exception Detector", layout="wide")


def api_key() -> str | None:
    try:
        key = st.secrets.get("ANTHROPIC_API_KEY")
    except Exception:  # no secrets.toml
        key = None
    return key or os.environ.get("ANTHROPIC_API_KEY")


@st.cache_data(show_spinner=False)
def analyse(raw: pd.DataFrame, policy_csv: str, use_ai: bool, key: str | None):
    from io import StringIO

    policy = Policy.from_frame(pd.read_csv(StringIO(policy_csv), dtype=str).fillna(""))
    res = run(raw, policy, use_ai=use_ai, api_key=key)
    report = evaluate(raw, res.exceptions) if "planted_issue" in raw.columns else None
    return res.exceptions, res.summary, res.ai_used, res.notes, report


# ------------------------------------------------------------------ sidebar
st.sidebar.header("Data")
source = st.sidebar.radio("Expense data", ["Bundled sample (synthetic)", "Upload a CSV"])
uploaded = st.sidebar.file_uploader("Expense export (CSV)", type="csv") if source == "Upload a CSV" else None
policy_upload = st.sidebar.file_uploader("Policy file (optional CSV)", type="csv")

st.sidebar.header("AI review")
key = api_key()
use_ai = st.sidebar.toggle("Use Claude for reasons and description checks", value=bool(key), disabled=not key)
if not key:
    st.sidebar.caption("Add ANTHROPIC_API_KEY to Streamlit secrets to turn this on. "
                       "Offline mode uses rule-based reasons and a keyword description check.")

# ------------------------------------------------------------------ header
st.title("ClaimCheck")
st.caption("AI expense exception detector: every line checked against 10 duplicate and policy rules, "
           "ranked by severity, with a plain-English reason for each flag.")
st.info("Demo on synthetic data. No real employee or employer data is used.", icon="ℹ️")

if source == "Upload a CSV" and uploaded is None:
    st.write("Upload an expense CSV with columns: line_id, report_id, employee_id, expense_date, merchant, "
             "category, amount_usd, receipt_attached, description (merchant_type optional).")
    st.stop()

raw = pd.read_csv(uploaded if uploaded is not None else SAMPLE, dtype={"line_id": str})
policy_csv = (policy_upload.getvalue().decode() if policy_upload else POLICY_FILE.read_text())

try:
    with st.spinner("Checking every line..."):
        exceptions, summary, ai_used, notes, report = analyse(raw, policy_csv, use_ai, key)
except ValueError as e:
    st.error(f"Could not read this file: {e}")
    st.stop()

for n in notes:
    st.warning(n)

# ------------------------------------------------------------------ summary tiles
c1, c2, c3, c4 = st.columns(4)
c1.metric("Lines reviewed", f"{summary['lines_reviewed']:,}")
c2.metric("Lines flagged", f"{summary['lines_flagged']:,}",
          f"{summary['lines_flagged'] / max(summary['lines_reviewed'], 1):.1%} of lines", delta_color="off")
c3.metric("Dollars flagged", f"${summary['dollars_flagged']:,.0f}",
          f"of ${summary['dollars_reviewed']:,.0f} reviewed", delta_color="off")
c4.metric("High severity", f"{summary['high_severity']:,}")
st.caption(f"Mode: {'AI review (Claude API)' if ai_used else 'offline (rules + keyword check)'} · "
           f"full review in {summary['seconds']} s")

tab_queue, tab_rules, tab_acc = st.tabs(["Exception queue", "Flags by rule", "Accuracy"])

# ------------------------------------------------------------------ queue
with tab_queue:
    f1, f2, f3 = st.columns([1, 2, 2])
    sev = f1.multiselect("Severity", ["High", "Medium", "Low"], default=["High", "Medium", "Low"])
    rule_pick = f2.multiselect("Rule", [RULE_LABELS[r] for r in RULE_ORDER])
    search = f3.text_input("Search employee, merchant or description")

    view = exceptions[exceptions["severity"].isin(sev)]
    if rule_pick:
        view = view[view["rules"].apply(lambda s: any(r in s for r in rule_pick))]
    if search:
        s = search.lower()
        view = view[view[["employee_id", "merchant", "description", "line_id", "report_id"]]
                    .apply(lambda r: s in " ".join(map(str, r)).lower(), axis=1)]

    show = view[["severity", "line_id", "report_id", "employee_id", "expense_date", "merchant", "category",
                 "amount_usd", "rules", "reason"]].copy()
    show["expense_date"] = show["expense_date"].dt.strftime("%Y-%m-%d")
    st.dataframe(
        show, hide_index=True, width="stretch", height=520,
        column_config={
            "severity": "Severity", "line_id": "Line", "report_id": "Report", "employee_id": "Employee",
            "expense_date": "Date", "merchant": "Merchant", "category": "Category",
            "amount_usd": st.column_config.NumberColumn("Amount", format="$%.2f"),
            "rules": "Rules hit", "reason": st.column_config.TextColumn("Why it was flagged", width="large"),
        },
    )
    st.download_button("Download exceptions CSV", for_export(view).to_csv(index=False).encode(),
                       "claimcheck_exceptions.csv", "text/csv")

# ------------------------------------------------------------------ by rule
with tab_rules:
    counts = pd.DataFrame({"Rule": list(summary["flags_by_rule"]), "Flags": list(summary["flags_by_rule"].values())})
    st.bar_chart(counts, x="Rule", y="Flags", horizontal=True, height=380)
    st.caption("A line can hit more than one rule.")

# ------------------------------------------------------------------ accuracy
with tab_acc:
    if report is None:
        st.write("Accuracy is shown when the file has a planted_issue answer-key column (the bundled sample does).")
    else:
        o = report.overall
        a1, a2, a3, a4 = st.columns(4)
        a1.metric("Planted exceptions", o["planted"])
        a2.metric("Found (recall)", f"{o['recall']:.0%}", f"{o['true_positives']} of {o['planted']}", delta_color="off")
        a3.metric("Flags that were real (precision)", f"{o['precision']:.0%}")
        a4.metric("Clean lines wrongly flagged", f"{report.lines['clean_lines_flagged']}",
                  f"of {report.lines['lines_total'] - report.lines['lines_planted']:,}", delta_color="off")
        t = report.by_rule.rename(columns=lambda c: c.replace("_", " ").capitalize())
        st.dataframe(t, hide_index=True, width="stretch", column_config={
            "Precision": st.column_config.NumberColumn(format="percent"),
            "Recall": st.column_config.NumberColumn(format="percent"),
        })
        if len(report.errors):
            st.subheader("Misses and false positives")
            st.caption("The sample includes deliberately hard cases and legitimate lookalikes, so these are expected.")
            st.dataframe(report.errors[["type", "line_id", "rule", "merchant", "amount_usd", "description"]],
                         hide_index=True, width="stretch")
