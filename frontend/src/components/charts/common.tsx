export const axisProps = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;
export const gridProps = { stroke: "var(--border)", strokeDasharray: "3 3", vertical: false } as const;
export const tooltipStyle = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" },
  labelStyle: { color: "var(--foreground)", fontWeight: 600 },
  cursor: { fill: "var(--muted)", opacity: 0.5 },
} as const;
