"""Generate a synthetic expense dataset with a planted answer key.

    python -m src.generate_data

Writes data/expenses.csv and data/policy.csv. Every line is fake: fake
employees, made-up merchants, random amounts. The planted_issue column is the
answer key used by evaluate.py; the rules never read it.

What gets planted (about 5% of lines):
- ~100 standard exceptions across all 10 rules
- a few deliberately hard cases the rules are NOT tuned to catch
  (near duplicates 3-5% apart, a split across two days, personal
  descriptions that still use business words) so accuracy is honest
- legitimate lookalikes that are NOT exceptions (colleagues at the same
  group hotel rate, same-fare round-trip car rides)

A fixed seed makes every run identical.
"""
from __future__ import annotations

import random
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from .ai_review import CATEGORY_KEYWORDS, heuristic_mismatches
from .policy import default_policy
from .rules import prepare, run_rules

SEED = 42
ROOT = Path(__file__).resolve().parent.parent
START, END = date(2026, 1, 5), date(2026, 6, 26)
TARGET_CLEAN_LINES = 1880

POLICY = default_policy()
HOLIDAYS = {d.date() for d in POLICY.holidays}

FIRST = ["Avery", "Jordan", "Priya", "Marcus", "Elena", "Tariq", "Grace", "Diego", "Hannah", "Kwame",
         "Sofia", "Liam", "Mei", "Andre", "Fatima", "Noah", "Ines", "Caleb", "Yuki", "Rosa"]
LAST = ["Bennett", "Okafor", "Shah", "Delgado", "Novak", "Haddad", "Kim", "Reyes", "Foster", "Mensah",
        "Larsen", "Quinn", "Chen", "Duarte", "Rahman", "Ellis", "Moreau", "Price", "Tanaka", "Vega"]

MERCHANTS = {
    "Airfare": [("SkyBridge Airlines", "Airline"), ("Northstar Air", "Airline"),
                ("Coastal Jet", "Airline"), ("Meridian Airways", "Airline")],
    "Hotel": [("Harborview Suites", "Hotel"), ("The Linden Hotel", "Hotel"),
              ("Parkside Inn & Suites", "Hotel"), ("Grand Meridian Hotel", "Hotel")],
    "Meals": [("Harborline Grill", "Restaurant"), ("Blue Fern Cafe", "Restaurant"),
              ("Brick Oven Bistro", "Restaurant"), ("Saffron Table", "Restaurant"),
              ("Corner Deli Co.", "Restaurant"), ("Maple Street Diner", "Restaurant")],
    "Ground transport": [("Metro Car Service", "Taxi / rideshare"), ("CityRide", "Taxi / rideshare"),
                         ("Yellowline Taxi", "Taxi / rideshare"), ("SwiftLift", "Taxi / rideshare")],
    "Client entertainment": [("Vantage Steakhouse", "Restaurant"), ("The Oak Room", "Restaurant"),
                             ("Pier 9 Seafood", "Restaurant")],
    "Software": [("CloudDesk Pro", "Software"), ("DataNest", "Software"), ("SlideCraft", "Software")],
    "Office supplies": [("PaperTrail Supply", "Office supply store"), ("DeskPoint", "Office supply store"),
                        ("OfficeHub", "Office supply store")],
    "Conference fees": [("FinOps Summit", "Event registration"), ("AP & P2P Forum", "Event registration"),
                        ("Treasury Leaders Conference", "Event registration")],
}
BLOCKED = {
    "Client entertainment": [("Lucky Seven Casino", "Casino"), ("Serenity Day Spa", "Spa")],
    "Office supplies": [("GiftCard Express", "Gift cards")],
    "Meals": [("Bottle Shop Wines & Spirits", "Liquor store")],
}
AMOUNT_RANGE = {
    "Airfare": (180, 760), "Hotel": (140, 330), "Meals": (12, 95), "Ground transport": (15, 140),
    "Client entertainment": (80, 290), "Software": (15, 190), "Office supplies": (8, 145),
    "Conference fees": (300, 1150),
}
CITIES = ["Chicago", "Boston", "Atlanta", "Denver", "Dallas", "Seattle", "Miami", "Toronto"]
PURPOSES = ["Q1 vendor review", "quarter-end close support", "client onboarding", "ERP workshop",
            "audit fieldwork", "regional finance meeting", "vendor negotiation", "process training"]
CLIENTS = ["Atlas Logistics", "Brightwave Health", "Crescent Retail", "Dunmore Capital", "Evergreen Foods"]
TOOLS = ["CloudDesk Pro", "DataNest", "SlideCraft"]

DESCRIPTIONS = {
    "Airfare": ["Flight to {city} for {purpose}", "Round-trip airfare - {purpose}", "Return flight from {city}"],
    "Hotel": ["Hotel - {city} {purpose}", "Lodging for {purpose}", "Hotel night - {city}"],
    "Meals": ["Lunch during {purpose}", "Dinner while traveling - {city}", "Breakfast - {purpose}",
              "Team lunch - {purpose}", "Working dinner - {purpose}"],
    "Ground transport": ["Taxi to airport", "Rideshare to client office", "Car service - {city}",
                         "Taxi from airport to hotel", "Rideshare to vendor site"],
    "Client entertainment": ["Client dinner - {client}", "Client entertainment - {client}",
                             "Lunch with client - {client}"],
    "Software": ["Monthly subscription - {tool}", "Software license - {tool}", "Annual license renewal - {tool}"],
    "Office supplies": ["Printer paper and toner", "Office supplies - notebooks and pens", "Desk supplies",
                        "Office supplies - binders and folders"],
    "Conference fees": ["Registration - {conf}", "Conference fee - {conf}"],
}
# Obvious mismatches: none of the category's expected words.
OBVIOUS_MISMATCH = {
    "Meals": ["Personal phone bill", "Gym membership renewal"],
    "Office supplies": ["Concert tickets for family", "Weekend groceries"],
    "Software": ["Streaming movies for kids", "Video game purchase"],
    "Ground transport": ["Weekend groceries", "Birthday present"],
    "Client entertainment": ["Birthday party for my daughter", "Personal gym class"],
}
# Subtle mismatches: personal spend that still uses business words.
SUBTLE_MISMATCH = {
    "Meals": "Family dinner while on vacation",
    "Hotel": "Hotel for personal weekend getaway",
    "Ground transport": "Taxi to my cousin's wedding",
    "Software": "Personal subscription - movie streaming",
    "Office supplies": "Office supplies for kids' school project",
}


class Generator:
    def __init__(self, seed: int = SEED):
        self.r = random.Random(seed)
        self.lines: list[dict] = []
        self.next_line = 1
        self.next_report = 1
        self.employees = [
            {"employee_id": f"E{i:03d}", "employee_name": f"{self.r.choice(FIRST)} {self.r.choice(LAST)}"}
            for i in range(1, 41)
        ]
        self.reports_by_emp: dict[str, list[str]] = {e["employee_id"]: [] for e in self.employees}
        self.used: set[str] = set()  # line_ids already planted or used as an original

    # ------------------------------------------------------------ helpers
    def workday(self, lo: date = START, hi: date = END) -> date:
        while True:
            d = lo + timedelta(days=self.r.randint(0, (hi - lo).days))
            if d.weekday() < 5 and d not in HOLIDAYS:
                return d

    def amount(self, lo: float, hi: float) -> float:
        while True:
            a = round(self.r.uniform(lo, hi), 2)
            if round(a * 100) % 100 != 0:  # clean lines are never whole-dollar
                return a

    def describe(self, category: str, ctx: dict, merchant: str = "") -> str:
        if category in ("Software", "Conference fees") and merchant:
            ctx = {**ctx, "tool": merchant, "conf": merchant}  # name the product actually bought
        return self.r.choice(DESCRIPTIONS[category]).format(**ctx)

    def add(self, emp: dict, report_id: str, d: date, category: str, ctx: dict,
            merchant: tuple[str, str] | None = None, amount: float | None = None,
            description: str | None = None, receipt: str | None = None, planted: str = "") -> dict:
        m = merchant or self.r.choice(MERCHANTS[category])
        a = amount if amount is not None else self.amount(*AMOUNT_RANGE[category])
        line = {
            "line_id": f"L{self.next_line:04d}",
            "report_id": report_id,
            "employee_id": emp["employee_id"],
            "employee_name": emp["employee_name"],
            "expense_date": d,
            "merchant": m[0],
            "merchant_type": m[1],
            "category": category,
            "amount_usd": a,
            "receipt_attached": receipt or ("Y" if a > POLICY.receipt_threshold or self.r.random() < 0.7 else "N"),
            "description": description or self.describe(category, ctx, m[0]),
            "planted_issue": planted,
            "_ctx": ctx,
        }
        self.next_line += 1
        self.lines.append(line)
        return line

    def copy(self, base: dict, **changes) -> dict:
        line = dict(base)
        line.update(changes)
        line["line_id"] = f"L{self.next_line:04d}"
        self.next_line += 1
        self.lines.append(line)
        return line

    def emp(self, employee_id: str) -> dict:
        return next(e for e in self.employees if e["employee_id"] == employee_id)

    def ctx(self) -> dict:
        return {"city": self.r.choice(CITIES), "purpose": self.r.choice(PURPOSES),
                "client": self.r.choice(CLIENTS), "tool": self.r.choice(TOOLS),
                "conf": self.r.choice([m[0] for m in MERCHANTS["Conference fees"]])}

    def new_report(self, emp: dict) -> str:
        rid = f"R{self.next_report:04d}"
        self.next_report += 1
        self.reports_by_emp[emp["employee_id"]].append(rid)
        return rid

    # ------------------------------------------------------------ clean data
    def trip(self, emp: dict) -> None:
        rid, ctx = self.new_report(emp), self.ctx()
        start = self.workday(START, END - timedelta(days=6))
        nights = self.r.randint(1, 4)
        end = start + timedelta(days=nights)
        days = [start + timedelta(days=i) for i in range(nights + 1)]
        self.add(emp, rid, start, "Airfare", ctx)
        if self.r.random() < 0.6:
            self.add(emp, rid, end, "Airfare", ctx)
        hotel = self.r.choice(MERCHANTS["Hotel"])
        rate = self.amount(*AMOUNT_RANGE["Hotel"])
        for d in days[:-1]:
            self.add(emp, rid, d, "Hotel", ctx, merchant=hotel, amount=rate)
        for d in days:
            for _ in range(self.r.randint(1, 2)):
                self.add(emp, rid, d, "Meals", ctx)
        for _ in range(self.r.randint(1, 3)):
            self.add(emp, rid, self.r.choice(days), "Ground transport", ctx)
        if self.r.random() < 0.3:
            self.add(emp, rid, start, "Conference fees", ctx)

    def local(self, emp: dict) -> None:
        rid, ctx = self.new_report(emp), self.ctx()
        month_start = self.workday()
        lo = month_start.replace(day=1)
        hi = min((lo + timedelta(days=32)).replace(day=1) - timedelta(days=1), END)
        cats = ["Meals", "Client entertainment", "Software", "Office supplies", "Ground transport"]
        for _ in range(self.r.randint(3, 8)):
            self.add(emp, rid, self.workday(lo, hi), self.r.choice(cats), ctx)

    def build_clean(self) -> None:
        while len(self.lines) < TARGET_CLEAN_LINES:
            emp = self.r.choice(self.employees)
            (self.trip if self.r.random() < 0.55 else self.local)(emp)

    def scrub(self) -> None:
        """Re-draw any clean line that trips a rule, until the clean set is clean."""
        for _ in range(100):
            df = prepare(pd.DataFrame(self.lines))
            hits = run_rules(df, POLICY) + heuristic_mismatches(df)
            bad = {h["line_id"] for h in hits}
            if not bad:
                return
            for line in self.lines:
                if line["line_id"] in bad:
                    line["merchant"], line["merchant_type"] = self.r.choice(MERCHANTS[line["category"]])
                    line["amount_usd"] = self.amount(*AMOUNT_RANGE[line["category"]])
                    if line["category"] in POLICY.weekend_restricted_categories:
                        d = line["expense_date"]
                        while d.weekday() >= 5 or d in HOLIDAYS:
                            d -= timedelta(days=1)
                        line["expense_date"] = d
                    if line["amount_usd"] > POLICY.receipt_threshold:
                        line["receipt_attached"] = "Y"
        raise RuntimeError("Could not scrub clean data")

    # ------------------------------------------------------------ planting
    def pick(self, categories, cond=lambda l: True) -> dict:
        pool = [l for l in self.lines if not l["planted_issue"] and l["line_id"] not in self.used
                and l["category"] in categories and cond(l)]
        line = self.r.choice(pool)
        self.used.add(line["line_id"])
        return line

    def alone(self, line: dict) -> bool:
        """No other line for this employee at this merchant on this day."""
        return sum(l["employee_id"] == line["employee_id"] and l["merchant"] == line["merchant"]
                   and l["expense_date"] == line["expense_date"] for l in self.lines) == 1

    def free_slot(self, employee_id: str, merchant: str, d: date) -> bool:
        return not any(l["employee_id"] == employee_id and l["merchant"] == merchant and l["expense_date"] == d
                       for l in self.lines)

    def plant_exact_duplicates(self, n: int) -> None:
        for _ in range(n):
            base = self.pick(["Meals", "Ground transport", "Hotel", "Client entertainment"])
            reports = self.reports_by_emp[base["employee_id"]]
            rid = self.r.choice(reports) if self.r.random() < 0.5 else base["report_id"]
            self.copy(base, report_id=rid, planted_issue="exact_duplicate")

    def plant_near_duplicates(self, n: int, hard: bool = False) -> None:
        cats = ["Meals", "Ground transport", "Hotel", "Client entertainment"]
        made = 0
        while made < n:
            base = self.pick(cats)
            limit = POLICY.category_limits[base["category"]]
            lo, hi = (0.03, 0.05) if hard else (0.004, 0.018)
            sign = self.r.choice([-1, 1])
            amt = round(base["amount_usd"] * (1 + sign * self.r.uniform(lo, hi)), 2)
            if amt > limit or round(amt * 100) % 100 == 0 or amt == base["amount_usd"]:
                continue
            shift = self.r.randint(1, 3) if hard else self.r.randint(0, 3)
            d = base["expense_date"] + timedelta(days=shift)
            if base["category"] in POLICY.weekend_restricted_categories and (d.weekday() >= 5 or d in HOLIDAYS):
                continue
            if d > END or not self.free_slot(base["employee_id"], base["merchant"], d):
                continue
            self.copy(base, expense_date=d, amount_usd=amt,
                      receipt_attached="Y" if amt > POLICY.receipt_threshold else base["receipt_attached"],
                      description=self.describe(base["category"], base["_ctx"], base["merchant"]),
                      planted_issue="near_duplicate")
            made += 1

    def plant_cross_employee(self, n: int) -> None:
        made = 0
        while made < n:
            base = self.pick(["Meals", "Client entertainment", "Ground transport"])
            other = self.r.choice([e for e in self.employees if e["employee_id"] != base["employee_id"]])
            if not self.reports_by_emp[other["employee_id"]]:
                continue
            if not self.free_slot(other["employee_id"], base["merchant"], base["expense_date"]):
                continue
            self.copy(base, employee_id=other["employee_id"], employee_name=other["employee_name"],
                      report_id=self.r.choice(self.reports_by_emp[other["employee_id"]]),
                      description=self.describe(base["category"], base["_ctx"], base["merchant"]),
                      planted_issue="cross_employee_duplicate")
            made += 1

    def plant_over_limit(self, n: int) -> None:
        for _ in range(n):
            line = self.pick(list(AMOUNT_RANGE))
            line["amount_usd"] = self.amount(POLICY.category_limits[line["category"]] * 1.08,
                                             POLICY.category_limits[line["category"]] * 1.7)
            line["receipt_attached"] = "Y"
            line["planted_issue"] = "over_limit"

    def plant_missing_receipts(self, n: int) -> None:
        for _ in range(n):
            line = self.pick(list(AMOUNT_RANGE), lambda l: l["amount_usd"] > POLICY.receipt_threshold)
            line["receipt_attached"] = "N"
            line["planted_issue"] = "missing_receipt"

    def plant_splits(self, groups: int, hard: bool = False) -> None:
        cats = ["Meals", "Office supplies", "Client entertainment", "Ground transport"]
        made = 0
        while made < groups:
            base = self.pick(cats)
            cat, limit = base["category"], POLICY.category_limits[base["category"]]
            emp = self.emp(base["employee_id"])
            merchant = self.r.choice(MERCHANTS[cat])
            k = 2 if hard else self.r.choice([2, 3])
            d1 = base["expense_date"]
            d2 = d1 + timedelta(days=1)
            while d2.weekday() >= 5 or d2 in HOLIDAYS:
                d2 += timedelta(days=1)
            dates = [d1, d2] if hard else [d1] * k
            if any(not self.free_slot(emp["employee_id"], merchant[0], d) for d in set(dates)):
                continue
            amounts: list[float] = []
            while len(amounts) < k:
                a = self.amount(limit * 0.55, limit * 0.92)
                if all(abs(a - b) / max(a, b) > 0.03 for b in amounts):
                    amounts.append(a)
            for d, a in zip(dates, amounts):
                self.add(emp, base["report_id"], d, cat, base["_ctx"], merchant=merchant, amount=a,
                         receipt="Y", planted="split_transaction")
            made += 1

    def plant_round_amounts(self, n: int, with_missing_receipt: int) -> None:
        values = [100, 125, 150, 200, 250, 300, 400, 500, 750, 1000]
        for i in range(n):
            line = self.pick([c for c, lim in POLICY.category_limits.items() if lim >= 150], self.alone)
            line["amount_usd"] = float(self.r.choice([v for v in values if v <= POLICY.category_limits[line["category"]]]))
            if i < with_missing_receipt:
                line["receipt_attached"] = "N"
                line["planted_issue"] = "round_amount|missing_receipt"
            else:
                line["receipt_attached"] = "Y"
                line["planted_issue"] = "round_amount"

    def plant_weekend_holiday(self, n: int, holidays: int) -> None:
        hol = sorted(HOLIDAYS)
        for i in range(n):
            line = self.pick(sorted(POLICY.weekend_restricted_categories))
            if i < holidays:
                line["expense_date"] = hol[i % len(hol)]
            else:
                d = line["expense_date"]
                while d.weekday() < 5:
                    d += timedelta(days=1)
                line["expense_date"] = d
            line["planted_issue"] = "weekend_holiday"

    def plant_blocked(self, n: int) -> None:
        for _ in range(n):
            line = self.pick(list(BLOCKED))
            line["merchant"], line["merchant_type"] = self.r.choice(BLOCKED[line["category"]])
            line["planted_issue"] = "blocked_category"

    def plant_mismatches(self, n_obvious: int, subtle: bool = True) -> None:
        for _ in range(n_obvious):
            line = self.pick(list(OBVIOUS_MISMATCH))
            text = self.r.choice(OBVIOUS_MISMATCH[line["category"]])
            assert not any(w in text.lower() for w in CATEGORY_KEYWORDS[line["category"]])
            line["description"] = text
            line["planted_issue"] = "description_mismatch"
        if subtle:
            for cat, text in SUBTLE_MISMATCH.items():
                line = self.pick([cat])
                line["description"] = text
                line["planted_issue"] = "description_mismatch"

    def add_lookalikes(self) -> None:
        # Colleagues at the same conference hotel, same group rate: legitimate.
        for _ in range(6):
            base = self.pick(["Hotel"])
            other = self.r.choice([e for e in self.employees if e["employee_id"] != base["employee_id"]
                                   and self.reports_by_emp[e["employee_id"]]])
            self.copy(base, employee_id=other["employee_id"], employee_name=other["employee_name"],
                      report_id=self.r.choice(self.reports_by_emp[other["employee_id"]]),
                      description=f"Hotel - {base['_ctx']['city']} group rate")
        # Same-fare round trip by car on one day: legitimate, but looks like a duplicate.
        for _ in range(4):
            base = self.pick(["Ground transport"], lambda l: l["amount_usd"] < 70)
            base["description"] = "Car service to client office"
            self.copy(base, description="Car service back to hotel")

    # ------------------------------------------------------------ build
    def build(self) -> pd.DataFrame:
        self.build_clean()
        self.scrub()
        self.plant_exact_duplicates(12)
        self.plant_near_duplicates(10)
        self.plant_near_duplicates(3, hard=True)
        self.plant_cross_employee(8)
        self.plant_over_limit(12)
        self.plant_missing_receipts(9)
        self.plant_splits(4)
        self.plant_splits(1, hard=True)
        self.plant_round_amounts(10, with_missing_receipt=3)
        self.plant_weekend_holiday(10, holidays=3)
        self.plant_blocked(6)
        self.plant_mismatches(8)
        self.add_lookalikes()
        df = pd.DataFrame(self.lines).drop(columns="_ctx")
        df["expense_date"] = pd.to_datetime(df["expense_date"]).dt.strftime("%Y-%m-%d")
        df["receipt_attached"] = df["receipt_attached"].astype(str)
        return df.sort_values("line_id").reset_index(drop=True)


def main() -> None:
    df = Generator().build()
    (ROOT / "data").mkdir(exist_ok=True)
    df.to_csv(ROOT / "data" / "expenses.csv", index=False)
    default_policy().to_frame().to_csv(ROOT / "data" / "policy.csv", index=False)

    planted = df["planted_issue"].fillna("")
    counts = planted[planted != ""].str.split("|").explode().value_counts()
    print(f"Wrote {len(df):,} lines across {df['report_id'].nunique()} reports and "
          f"{df['employee_id'].nunique()} employees to data/expenses.csv")
    print(f"Lines with a planted issue: {(planted != '').sum()} ({(planted != '').mean():.1%})")
    print("Planted issues by type:")
    print(counts.to_string())


if __name__ == "__main__":
    main()
