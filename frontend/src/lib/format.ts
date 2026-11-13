export const usd = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
export const usdCompact = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k` : usd(n, 0);
export const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
export const int = (n: number) => n.toLocaleString("en-US");
export const fmtDate = (s: string) =>
  new Date(s + (s.length === 10 ? "T00:00:00Z" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
