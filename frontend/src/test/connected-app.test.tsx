import { createElement, type ComponentType } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoProvider, useDemo } from "@/lib/store";
import { DEFAULT_POLICY } from "@/lib/policy-defaults";
import { SYNTHETIC_LINES } from "@/data/synthetic/dataset";
import { Route } from "@/routes/accuracy";
import type { ApiAnalysis, ApiHealth, ApiSample } from "@/lib/api";

const sample: ApiSample = {
  policy: DEFAULT_POLICY,
  lines: [
    {
      line_id: "L9001",
      report_id: "R1",
      employee_id: "E001",
      employee_name: "Synthetic API Employee",
      expense_date: "2026-03-10",
      merchant: "Synthetic Cafe",
      merchant_type: "Restaurant",
      category: "Meals",
      amount_usd: 120,
      receipt_attached: true,
      description: "Dinner",
      planted_issue: "over_limit",
    },
  ],
};
const health: ApiHealth = {
  status: "ok",
  version: "1.0.0",
  ai: { available: false, provider: null, model: null },
  limits: { max_lines: 5000 },
  rules: [{ id: "over_limit", label: "Server policy limit", severity: "Medium" }],
};
const line = sample.lines[0];
if (!line) throw new Error("Missing sample fixture");
const analysis: ApiAnalysis = {
  mode: "offline",
  ai: { requested: false, used: false, model: null, calls: 0 },
  notes: ["API fixture"],
  policy: DEFAULT_POLICY,
  limits: health.limits,
  cached: false,
  summary: {
    lines_reviewed: 1,
    lines_flagged: 1,
    dollars_reviewed: 120,
    dollars_flagged: 120,
    high_severity: 0,
    by_severity: { High: 0, Medium: 1, Low: 0 },
    flags_by_rule: {} as ApiAnalysis["summary"]["flags_by_rule"],
    seconds: 0.2,
  },
  flagged: [
    {
      line,
      findings: [
        {
          rule: "over_limit",
          severity: "Medium",
          explanation: "Server finding",
          relatedLineIds: [],
        },
      ],
      severity: "Medium",
      reason: "API rule explanation",
    },
  ],
  evaluation: {
    per_rule: [
      {
        rule: "over_limit",
        label: "Server policy limit",
        planted: 8,
        detected: 7,
        tp: 6,
        fp: 1,
        missed: 2,
        precision: 0.813,
        recall: 0.627,
      },
    ],
    rule_totals: {
      rule: "all",
      label: "All rules",
      planted: 8,
      detected: 7,
      tp: 6,
      fp: 1,
      missed: 2,
      precision: 0.813,
      recall: 0.627,
    },
    tx_totals: { lines: 10, planted_lines: 8, flagged: 7, tp: 6, fp: 1, missed: 2 },
  },
};
let store: ReturnType<typeof useDemo>;
function Probe() {
  store = useDemo();
  return null;
}
function mount(accuracy = false) {
  const component = Route.options.component as ComponentType | undefined;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DemoProvider>
        <Probe />
        {accuracy && component ? createElement(component) : null}
      </DemoProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request) => {
      const path = String(url);
      const body = path.endsWith("/api/sample")
        ? sample
        : path.endsWith("/api/health")
          ? health
          : analysis;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("connected app with mocked fetch", () => {
  it("uses API results and names when HTTP requests succeed", async () => {
    mount();
    await waitFor(() => expect(store.apiStatus).toBe("ready"));
    expect(store.engine).toBe("python");
    expect(store.lines).toEqual(sample.lines);
    expect(store.flagged[0]?.reason).toBe("API rule explanation");
    expect(store.analysis).toEqual(analysis);
    expect(store.employeeName("E001")).toBe("Synthetic API Employee");
    expect(fetch).toHaveBeenCalledWith(
      "https://claimcheck-api.vercel.app/api/analyze",
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("falls back to the complete browser dataset and sets error status on HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "Service unavailable" }), { status: 503 }),
      ),
    );
    mount();
    await waitFor(() => expect(store.apiStatus).toBe("error"));
    expect(store.engine).toBe("browser");
    expect(store.lines).toBe(SYNTHETIC_LINES);
    expect(store.analysis).toBeUndefined();
    expect(store.apiError).toContain("Service unavailable");
    expect(JSON.parse(localStorage.getItem("claimcheck-demo-v2") ?? "{}").engine).toBe("python");
  });
  it("renders Accuracy from returned evaluation, not browser scoring or recomputed server ratios", async () => {
    mount(true);
    await waitFor(() => expect(store.apiStatus).toBe("ready"));
    expect(await screen.findByText("81.3%")).toBeInTheDocument();
    expect(screen.getByText("62.7%")).toBeInTheDocument();
    expect(screen.getByText("6 of 7 detections")).toBeInTheDocument();
    expect(screen.getByText("6 of 8 planted lines")).toBeInTheDocument();
    expect(store.analysis?.evaluation?.tx_totals.fp).toBe(1);
  });
});
