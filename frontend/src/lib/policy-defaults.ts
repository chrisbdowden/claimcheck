import type { Policy } from "./types";

export const DEFAULT_POLICY: Policy = {
  categoryLimits: {
    Airfare: 800,
    Hotel: 350,
    Meals: 100,
    "Ground transport": 150,
    "Client entertainment": 300,
    Software: 200,
    "Office supplies": 150,
    "Conference fees": 1200,
  },
  receiptThreshold: 75,
  roundNumberThreshold: 100,
  blockedMerchantTypes: ["Casino", "Liquor store", "Gift cards", "Spa"],
  weekendRestrictedCategories: ["Software", "Office supplies", "Client entertainment"],
  sharedExpenseCategories: ["Meals", "Client entertainment", "Ground transport"],
  holidays: [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-19", name: "Martin Luther King Jr. Day" },
    { date: "2026-02-16", name: "Presidents' Day" },
    { date: "2026-05-25", name: "Memorial Day" },
    { date: "2026-06-19", name: "Juneteenth" },
  ],
};
