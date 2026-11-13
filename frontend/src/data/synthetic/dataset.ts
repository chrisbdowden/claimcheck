/**
 * Deterministic synthetic dataset for the ClaimCheck prototype.
 * Fixed seed: every load produces identical lines, so KPIs, charts and tables reconcile.
 * All employees, merchants and amounts are fictional.
 */
import type { Category, Employee, ExpenseLine, RuleId } from "@/lib/types";
import { DEFAULT_POLICY } from "@/lib/policy-defaults";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Avery","Jordan","Priya","Mateo","Elena","Marcus","Hana","Theo","Nadia","Samir","Lucia","Owen","Ines","Kofi","Maren","Dev","Clara","Ravi","Sofia","Tobias","Leah","Andre","Mei","Felix","Zara","Jonah","Amara","Lukas","Noor","Callum","Yara","Bastian","Ingrid","Rohan","Talia","Emeka","Freya","Dario","Selin","Hugo"];
const LAST = ["Calder","Okafor","Lindqvist","Navarro","Brandt","Whitlock","Sato","Ferreira","Haddad","Kowalski","Marchetti","Quinlan","Dubois","Mensah","Holt","Varga","Ashby","Iyer","Castell","Reinholt","Moreau","Bishop","Tanaka","Engel","Rahimi","Pryce","Adeyemi","Strand","Farouk","MacLeod","Serrano","Vogel","Nygaard","Kapoor","Levin","Obi","Hartmann","Ricci","Aksoy","Lambert"];
const DEPTS = ["Sales","Consulting","Finance","Operations","Marketing","Engineering"];

export const EMPLOYEES: Employee[] = FIRST.map((f, i) => ({
  id: `E${1001 + i}`,
  name: `${f} ${LAST[i]!}`,
  department: DEPTS[i % DEPTS.length]!,
}));
export const EMPLOYEE_BY_ID = Object.fromEntries(EMPLOYEES.map((e) => [e.id, e]));

interface MerchantDef { name: string; type: string }
const MERCHANTS: Record<Category, MerchantDef[]> = {
  Airfare: [{ name: "SkyBridge Airlines", type: "Airline" }, { name: "Northwind Air", type: "Airline" }, { name: "Coastal Jet", type: "Airline" }],
  Hotel: [{ name: "Harborview Suites", type: "Hotel" }, { name: "Lakeshore Inn", type: "Hotel" }, { name: "Summit Lodge", type: "Hotel" }],
  Meals: [{ name: "Harborline Grill", type: "Restaurant" }, { name: "Copper Kettle Café", type: "Restaurant" }, { name: "Bistro Meridian", type: "Restaurant" }, { name: "Greenleaf Deli", type: "Restaurant" }],
  "Ground transport": [{ name: "Metro Car Service", type: "Car service" }, { name: "CityRide Taxi", type: "Taxi" }, { name: "Parkway Garage", type: "Parking" }],
  "Client entertainment": [{ name: "The Oak Room", type: "Restaurant" }, { name: "Riverside Theater", type: "Entertainment venue" }],
  Software: [{ name: "CloudDesk Pro", type: "Software" }, { name: "Brightline Analytics", type: "Software" }],
  "Office supplies": [{ name: "PaperTrail Supply", type: "Office supply" }, { name: "Desk & Co.", type: "Office supply" }],
  "Conference fees": [{ name: "FinOps Summit", type: "Conference" }, { name: "Controllers Forum", type: "Conference" }],
};
const BLOCKED: MerchantDef[] = [
  { name: "Lucky Seven Casino", type: "Casino" }, { name: "Corner Spirits", type: "Liquor store" },
  { name: "GiftHub Cards", type: "Gift cards" }, { name: "Serenity Day Spa", type: "Spa" },
];

const DESCRIPTIONS: Record<Category, string[]> = {
  Airfare: ["Round-trip flight to client site", "Airfare to regional office", "Flight change fee", "Economy airfare for audit fieldwork", "Checked baggage fee"],
  Hotel: ["Hotel stay, client visit", "Two-night lodging for workshop", "Hotel room, quarter-end close", "Lodging near client HQ"],
  Meals: ["Working lunch", "Dinner while traveling", "Breakfast before client meeting", "Team lunch during close", "Coffee with vendor contact"],
  "Ground transport": ["Taxi to airport", "Car service to client office", "Ride from hotel to site", "Airport parking", "Taxi back to hotel"],
  "Client entertainment": ["Client dinner, renewal discussion", "Hosting prospect lunch", "Client event tickets", "Client hospitality evening"],
  Software: ["Monthly software subscription", "Analytics user license", "Software add-on license", "Annual plugin subscription"],
  "Office supplies": ["Printer paper and toner", "Notebooks and pens", "Desk supplies for new hire", "Binders and folders for audit"],
  "Conference fees": ["Conference registration", "Summit registration fee", "Workshop registration", "Virtual conference pass"],
};

const RANGES: Record<Category, [number, number]> = {
  Airfare: [180, 720], Hotel: [120, 330], Meals: [12, 95], "Ground transport": [15, 140],
  "Client entertainment": [60, 280], Software: [9, 190], "Office supplies": [8, 140], "Conference fees": [250, 1100],
};
const WEIGHTS: [Category, number][] = [
  ["Meals", 32], ["Ground transport", 20], ["Hotel", 12], ["Airfare", 9], ["Client entertainment", 8],
  ["Software", 7], ["Office supplies", 8], ["Conference fees", 4],
];

const START = Date.UTC(2026, 0, 1);
const DAYS = 181; // Jan 1 – Jun 30, 2026
const HOLIDAYS = new Set(DEFAULT_POLICY.holidays.map((h) => h.date));
const RESTRICTED = new Set(DEFAULT_POLICY.weekendRestrictedCategories);

const iso = (d: number) => new Date(START + d * 86400000).toISOString().slice(0, 10);
const dow = (s: string) => new Date(s + "T00:00:00Z").getUTCDay();
const isWeekend = (s: string) => dow(s) === 0 || dow(s) === 6;
const addDays = (s: string, n: number) => new Date(Date.parse(s + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const cents = (n: number) => Math.round(n * 100) / 100;

function build(): ExpenseLine[] {
  const rnd = mulberry32(20260112);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const nonRound = (n: number) => {
    let v = cents(n);
    if (Number.isInteger(v)) v = cents(v + 0.37);
    return v;
  };
  const pickCategory = (): Category => {
    const total = WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = rnd() * total;
    for (const [c, w] of WEIGHTS) { if ((r -= w) < 0) return c; }
    return "Meals";
  };
  const workday = () => { let d: string; do { d = iso(Math.floor(rnd() * DAYS)); } while (isWeekend(d) || HOLIDAYS.has(d)); return d; };
  const weekendDay = () => { let d: string; do { d = iso(Math.floor(rnd() * DAYS)); } while (!isWeekend(d)); return d; };

  type Draft = Omit<ExpenseLine, "line_id" | "report_id">;
  const lines: Draft[] = [];
  const seen = new Set<string>();
  const mk = (p: Partial<Draft> & { category: Category }): Draft => {
    if (!p.expense_date && p.planted_issue === undefined) {
      let d: Draft; let tries = 0;
      do { d = mkRaw(p); tries++; } while (seen.has(`${d.employee_id}|${d.expense_date}|${d.category}`) && tries < 50);
      seen.add(`${d.employee_id}|${d.expense_date}|${d.category}`);
      return d;
    }
    return mkRaw(p);
  };
  const mkRaw = (p: Partial<Draft> & { category: Category }): Draft => {
    const m = p.merchant ? { name: p.merchant, type: p.merchant_type! } : pick(MERCHANTS[p.category]);
    const amount = p.amount_usd ?? nonRound(between(...RANGES[p.category]));
    const date = p.expense_date ?? (RESTRICTED.has(p.category) ? workday() : iso(Math.floor(rnd() * DAYS)));
    return {
      employee_id: p.employee_id ?? pick(EMPLOYEES).id,
      expense_date: date,
      merchant: m.name,
      merchant_type: m.type,
      category: p.category,
      amount_usd: amount,
      receipt_attached: p.receipt_attached ?? (amount > 75 ? true : rnd() > 0.15),
      description: p.description ?? pick(DESCRIPTIONS[p.category]),
      planted_issue: p.planted_issue ?? "",
    };
  };

  const PLANTED = 109;
  const LOOKALIKES = 8; // + 1 showcase original below
  const CLEAN = 1937 - PLANTED - LOOKALIKES - 1;
  for (let i = 0; i < CLEAN; i++) lines.push(mk({ category: pickCategory() }));
  const clean = lines.slice();
  const cleanOf = (cats: Category[]) => { let l: Draft; do { l = pick(clean); } while (!cats.includes(l.category as Category)); return l; };
  const plant = (rule: RuleId, d: Draft) => lines.push({ ...d, planted_issue: rule });

  // Exact duplicates (14), including the showcase: a second $86.40 at Harborline Grill
  const showcase = mk({ category: "Meals", merchant: "Harborline Grill", merchant_type: "Restaurant", amount_usd: 86.4, receipt_attached: true, description: "Dinner while traveling", employee_id: "E1003", expense_date: "2026-03-12" });
  lines.splice(0, 0, showcase);
  plant("exact_duplicate", { ...showcase });
  for (let i = 0; i < 13; i++) plant("exact_duplicate", { ...cleanOf(["Meals", "Hotel", "Airfare", "Ground transport", "Software", "Office supplies"]) });

  // Near duplicates (10): 8 within 2%, 2 deliberately at ~2.6% (difficult, expected misses)
  for (let i = 0; i < 10; i++) {
    const o = cleanOf(["Hotel", "Airfare", "Meals", "Ground transport"]);
    const pct = i < 8 ? 0.008 + rnd() * 0.01 : 0.026;
    plant("near_duplicate", { ...o, amount_usd: nonRound(o.amount_usd * (1 + pct)), expense_date: addDays(o.expense_date, 1 + Math.floor(rnd() * 2)) });
  }
  // Cross-employee duplicates (8): 7 in shared categories, 1 in Hotel (outside shared list → expected miss)
  for (let i = 0; i < 8; i++) {
    const o = cleanOf(i < 7 ? ["Meals", "Client entertainment", "Ground transport"] : ["Hotel"]);
    let emp: string; do { emp = pick(EMPLOYEES).id; } while (emp === o.employee_id);
    plant("cross_employee_duplicate", { ...o, employee_id: emp });
  }
  // Over policy limit (14)
  const cats: Category[] = ["Meals", "Hotel", "Airfare", "Ground transport", "Client entertainment", "Software", "Office supplies", "Conference fees"];
  for (let i = 0; i < 14; i++) {
    const c = cats[i % cats.length]!;
    const lim = DEFAULT_POLICY.categoryLimits[c]!;
    plant("over_policy_limit", mk({ category: c, amount_usd: nonRound(lim * between(1.08, 1.55)), receipt_attached: true }));
  }
  // Missing receipt (14): 13 clear, 1 at exactly the threshold (expected miss)
  for (let i = 0; i < 14; i++) {
    const c = (["Meals", "Ground transport", "Hotel", "Client entertainment"] as Category[])[i % 4]!;
    const lim = DEFAULT_POLICY.categoryLimits[c]!;
    plant("missing_receipt", mk({ category: c, amount_usd: i === 13 ? 75 : nonRound(between(78, Math.min(lim * 0.9, 280))), receipt_attached: false }));
  }
  // Split transactions (6 groups × 2 lines)
  for (let g = 0; g < 6; g++) {
    const c: Category = (["Software", "Office supplies", "Meals"] as Category[])[g % 3]!;
    const lim = DEFAULT_POLICY.categoryLimits[c]!;
    let emp: string, date: string;
    do { emp = pick(EMPLOYEES).id; date = workday(); } while (seen.has(`${emp}|${date}|${c}`));
    seen.add(`${emp}|${date}|${c}`);
    const m = pick(MERCHANTS[c]);
    const a = nonRound(lim * between(0.55, 0.7)); const b = nonRound(lim * between(0.5, 0.65));
    plant("split_transaction", mk({ category: c, employee_id: emp, expense_date: date, merchant: m.name, merchant_type: m.type, amount_usd: a, receipt_attached: true }));
    plant("split_transaction", mk({ category: c, employee_id: emp, expense_date: date, merchant: m.name, merchant_type: m.type, amount_usd: b, receipt_attached: true }));
  }
  // Round-number amounts (10)
  const rounds: [Category, number][] = [["Hotel", 200], ["Hotel", 250], ["Hotel", 300], ["Airfare", 400], ["Airfare", 500], ["Airfare", 600], ["Conference fees", 500], ["Conference fees", 750], ["Ground transport", 120], ["Client entertainment", 200]];
  for (const [c, v] of rounds) plant("round_number", mk({ category: c, amount_usd: v, receipt_attached: true }));
  // Weekend / holiday (8): 6 weekend, 2 weekday holidays
  for (let i = 0; i < 8; i++) {
    const c: Category = (["Software", "Office supplies", "Client entertainment"] as Category[])[i % 3]!;
    plant("weekend_holiday", mk({ category: c, expense_date: i < 6 ? weekendDay() : ["2026-01-19", "2026-05-25"][i - 6]!, amount_usd: nonRound(between(20, 70)), receipt_attached: true }));
  }
  // Blocked category (8)
  for (let i = 0; i < 8; i++) {
    const m = BLOCKED[i % 4]!;
    plant("blocked_category", mk({ category: "Client entertainment", merchant: m.name, merchant_type: m.type, amount_usd: i === 0 ? 145.37 : nonRound(between(35, 70)), receipt_attached: true, description: pick(["Client hospitality evening", "Hosting prospect lunch", "Client event tickets"]) }));
  }
  // Description mismatches (11): 8 obvious keyword conflicts, 3 subtle (expected misses for the offline heuristic)
  const mism: [Category, string][] = [
    ["Meals", "Wireless keyboard and mouse"], ["Meals", "Hotel room upgrade"], ["Ground transport", "Dinner with family"],
    ["Software", "Taxi to airport"], ["Office supplies", "Flight seat upgrade"], ["Hotel", "Printer toner cartridges"],
    ["Ground transport", "Conference registration"], ["Software", "Team lunch"],
    ["Meals", "Personal shopping"], ["Office supplies", "Gym membership"], ["Ground transport", "Weekend getaway"],
  ];
  for (const [c, d] of mism) plant("description_mismatch", mk({ category: c, description: d, amount_usd: nonRound(between(18, 70)), receipt_attached: true }));

  // Legitimate lookalikes (unlabelled)
  const shared = workday();
  lines.push(mk({ category: "Meals", merchant: "Bistro Meridian", merchant_type: "Restaurant", employee_id: "E1010", expense_date: shared, amount_usd: 64.2, description: "Team lunch during close", receipt_attached: true }));
  lines.push(mk({ category: "Meals", merchant: "Bistro Meridian", merchant_type: "Restaurant", employee_id: "E1011", expense_date: shared, amount_usd: 58.75, description: "Team lunch during close", receipt_attached: true }));
  for (const month of ["01", "02", "03"]) lines.push(mk({ category: "Software", merchant: "CloudDesk Pro", merchant_type: "Software", employee_id: "E1020", expense_date: `2026-${month}-05`, amount_usd: 49.99, description: "Monthly software subscription", receipt_attached: true }));
  lines.push(mk({ category: "Hotel", merchant: "Harborview Suites", merchant_type: "Hotel", amount_usd: 350, description: "Hotel stay, client visit (contracted rate)", receipt_attached: true }));
  lines.push(mk({ category: "Hotel", merchant: "Lakeshore Inn", merchant_type: "Hotel", amount_usd: 350, description: "Hotel room, quarter-end close (contracted rate)", receipt_attached: true }));
  lines.push(mk({ category: "Airfare", merchant: "SkyBridge Airlines", merchant_type: "Airline", amount_usd: 100, description: "Flight change fee (fixed fare rule)", receipt_attached: true }));

  // Stable sort by date, then assign IDs in that order.
  const sorted = lines.map((l, i) => ({ l, i })).sort((a, b) => a.l.expense_date.localeCompare(b.l.expense_date) || a.i - b.i);
  return sorted.map(({ l }, i) => ({
    ...l,
    line_id: `L${String(i + 1).padStart(5, "0")}`,
    report_id: `R-${l.employee_id.slice(1)}-${l.expense_date.slice(0, 7).replace("-", "")}`,
  }));
}

export const SYNTHETIC_LINES: ExpenseLine[] = build();
export const DATASET_NAME = "northstar_synthetic_h1_2026.csv";
