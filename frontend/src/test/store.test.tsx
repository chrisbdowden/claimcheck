import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoProvider, useDemo } from "@/lib/store";
import {
  analyze,
  ApiError,
  getHealth,
  getSample,
  type ApiAnalysis,
  type ApiSample,
} from "@/lib/api";
import { DEFAULT_POLICY } from "@/lib/policy-defaults";
import { SYNTHETIC_LINES } from "@/data/synthetic/dataset";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  analyze: vi.fn(),
  getHealth: vi.fn(),
  getSample: vi.fn(),
}));

const sample: ApiSample = {
  policy: DEFAULT_POLICY,
  lines: [
    {
      line_id: "L0001",
      report_id: "R1",
      employee_id: "E001",
      employee_name: "API Employee",
      expense_date: "2026-03-10",
      merchant: "Cafe",
      merchant_type: "Restaurant",
      category: "Meals",
      amount_usd: 120,
      receipt_attached: true,
      description: "Dinner",
      planted_issue: "over_limit",
    },
  ],
};
const result: ApiAnalysis = {
  mode: "offline",
  ai: { requested: false, used: false, model: null, calls: 0 },
  notes: ["Offline keyword check"],
  summary: {
    lines_reviewed: 1,
    lines_flagged: 1,
    dollars_reviewed: 120,
    dollars_flagged: 120,
    high_severity: 0,
    by_severity: { High: 0, Medium: 1, Low: 0 },
    flags_by_rule: {} as ApiAnalysis["summary"]["flags_by_rule"],
    seconds: 0.1,
  },
  flagged: [
    {
      line: (() => {
        const line = sample.lines[0];
        if (!line) throw new Error("Missing test sample");
        return line;
      })(),
      findings: [
        {
          rule: "over_limit",
          severity: "Medium",
          explanation: "API explanation",
          relatedLineIds: [],
        },
      ],
      severity: "Medium",
      reason: "API reason",
    },
  ],
  evaluation: null,
  policy: DEFAULT_POLICY,
  limits: {},
  cached: false,
};
let store: ReturnType<typeof useDemo>;
function Probe() {
  store = useDemo();
  return null;
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DemoProvider>
        <Probe />
      </DemoProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(getSample).mockResolvedValue(sample);
  vi.mocked(getHealth).mockResolvedValue({
    status: "ok",
    version: "1.0.0",
    ai: { available: false, provider: null, model: null },
    limits: {},
    rules: [],
  });
  vi.mocked(analyze).mockResolvedValue(result);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("active ClaimCheck engine", () => {
  it("uses only API lines/findings/names and seeds review history from their IDs", async () => {
    mount();
    await waitFor(() => expect(store.apiStatus).toBe("ready"));
    expect(store.engine).toBe("python");
    expect(store.lines).toEqual(sample.lines);
    expect(store.flagged[0]?.reason).toBe("API reason");
    expect(store.employeeName("E001")).toBe("API Employee");
    expect(store.employeeById["E001"]?.department).toBe("—");
    expect(
      store.history.filter((event) => event.lineId).every((event) => event.lineId === "L0001"),
    ).toBe(true);
    expect(store.statusOf("L0001")).toBe("In Review");
    expect(analyze).toHaveBeenCalledWith({ source: "bundled", policy: DEFAULT_POLICY });
    expect(store.aiUsed).toBe(false);
    expect(store.aiNotes).toEqual(["Offline keyword check"]);
  });

  it("debounces policy saves by 500 ms and retains the previous result until success", async () => {
    mount();
    await waitFor(() => expect(store.apiStatus).toBe("ready"));
    vi.useFakeTimers();
    let finish: ((value: ApiAnalysis) => void) | undefined;
    vi.mocked(analyze).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const policy = { ...DEFAULT_POLICY, receiptThreshold: 90 };
    act(() => store.setPolicy({ ...policy, receiptThreshold: 80 }, "first save"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    act(() => store.setPolicy(policy, "last save"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(store.apiStatus).toBe("loading");
    expect(store.flagged).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(analyze).toHaveBeenLastCalledWith({ source: "bundled", policy, use_ai: false });
    expect(store.analysis).toEqual(result);
    await act(async () => {
      finish?.({ ...result, policy, flagged: [] });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(store.apiStatus).toBe("ready");
    expect(store.flagged).toHaveLength(0);
  });

  it.each(["sample", "health", "analysis"])(
    "falls back atomically if %s fails without persisting the outage",
    async (endpoint) => {
      const failing =
        endpoint === "sample" ? getSample : endpoint === "health" ? getHealth : analyze;
      vi.mocked(failing).mockRejectedValueOnce(new Error("API unavailable"));
      mount();
      await waitFor(() => expect(store.apiStatus).toBe("error"));
      expect(store.engine).toBe("browser");
      expect(store.apiError).toBe("API unavailable");
      expect(store.lines).toBe(SYNTHETIC_LINES);
      expect(store.analysis).toBeUndefined();
      expect(store.flagged.some((line) => line.reason === "API reason")).toBe(false);
      expect(JSON.parse(localStorage.getItem("claimcheck-demo-v2") ?? "{}").engine).toBe("python");
    },
  );

  it("restores a saved browser choice and does not contact the API", async () => {
    localStorage.setItem("claimcheck-demo-v2", JSON.stringify({ engine: "browser" }));
    mount();
    await waitFor(() => expect(store.engine).toBe("browser"));
    expect(store.lines).toBe(SYNTHETIC_LINES);
    expect(getSample).not.toHaveBeenCalled();
    expect(store.apiStatus).toBe("ready");
  });

  it("switches the entire dataset to browser if a policy reanalysis fails", async () => {
    mount();
    await waitFor(() => expect(store.apiStatus).toBe("ready"));
    vi.mocked(analyze).mockRejectedValueOnce(new Error("Policy analysis timed out"));
    act(() => store.setPolicy({ ...DEFAULT_POLICY, receiptThreshold: 90 }, "save"));
    await waitFor(() => expect(store.apiStatus).toBe("error"));
    expect(store.lines).toBe(SYNTHETIC_LINES);
    expect(store.employeeName("E001")).not.toBe("API Employee");
    expect(store.analysis).toBeUndefined();
  });

  it("runs bundled requests with live AI and shares the returned analysis", async () => {
    mount();
    await waitFor(() => expect(store.apiStatus).toBe("ready"));
    const aiResult = {
      ...result,
      ai: { requested: true, used: true, model: "Claude", calls: 1 },
      notes: ["Server note"],
    };
    vi.mocked(analyze).mockResolvedValueOnce(aiResult);
    await act(async () => {
      await store.runAnalysis({ source: "bundled", policy: DEFAULT_POLICY, use_ai: true });
    });
    expect(analyze).toHaveBeenLastCalledWith({
      source: "bundled",
      policy: DEFAULT_POLICY,
      use_ai: true,
    });
    expect(store.analysis).toBe(aiResult);
    expect(store.aiUsed).toBe(true);
    expect(store.aiNotes).toEqual(["Server note"]);
  });

  it("commits upload lines and findings together then restores bundled lines", async () => {
    mount();
    await waitFor(() => expect(store.apiStatus).toBe("ready"));
    const first = sample.lines[0];
    const firstFlagged = result.flagged[0];
    if (!first || !firstFlagged) throw new Error("Missing fixture");
    const uploadLines = [
      { ...first, line_id: "L9001", employee_id: "UPLOAD", employee_name: "Synthetic Uploader" },
    ];
    const uploadResult = {
      ...result,
      flagged: [{ ...firstFlagged, line: uploadLines[0] ?? first }],
    };
    vi.mocked(analyze).mockResolvedValueOnce(uploadResult);
    await act(async () => {
      await store.runAnalysis({
        source: "upload",
        lines: uploadLines,
        policy: DEFAULT_POLICY,
        use_ai: false,
      });
    });
    expect(store.lines).toEqual(uploadLines);
    expect(store.bundledLines).toEqual(sample.lines);
    expect(store.flagged[0]?.line.line_id).toBe("L9001");
    expect(store.employeeName("UPLOAD")).toBe("Synthetic Uploader");
    expect(store.analysis).toBe(uploadResult);
    await act(async () => {
      await store.runAnalysis({ source: "bundled", policy: DEFAULT_POLICY, use_ai: false });
    });
    expect(store.lines).toEqual(sample.lines);
    expect(store.flagged[0]?.line.line_id).toBe("L0001");
  });

  it("refreshes uploaded lines rather than mixing in the bundled dataset on policy save", async () => {
    mount();
    await waitFor(() => expect(store.apiStatus).toBe("ready"));
    await act(async () => {
      await store.runAnalysis({
        source: "upload",
        lines: sample.lines,
        policy: DEFAULT_POLICY,
        use_ai: false,
      });
    });
    const policy = { ...DEFAULT_POLICY, receiptThreshold: 90 };
    vi.mocked(analyze).mockResolvedValueOnce({ ...result, policy });
    act(() => store.setPolicy(policy, "save"));
    await waitFor(() => expect(store.analysis?.policy).toEqual(policy));
    expect(analyze).toHaveBeenLastCalledWith({
      source: "upload",
      lines: sample.lines,
      policy,
      use_ai: false,
    });
  });

  it("retains Python results on 422 so the user can correct the upload", async () => {
    mount();
    await waitFor(() => expect(store.apiStatus).toBe("ready"));
    vi.mocked(analyze).mockRejectedValueOnce(new ApiError(422, "Invalid category"));
    await act(async () => {
      await expect(store.runAnalysis({ source: "upload", lines: sample.lines })).rejects.toThrow(
        "Invalid category",
      );
    });
    expect(store.engine).toBe("python");
    expect(store.lines).toEqual(sample.lines);
    expect(store.analysis).toBe(result);
    expect(store.apiStatus).toBe("ready");
  });

  it("retains the previous snapshot until a real request finishes", async () => {
    mount();
    await waitFor(() => expect(store.apiStatus).toBe("ready"));
    let finish: ((value: ApiAnalysis) => void) | undefined;
    vi.mocked(analyze).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let pending: Promise<ApiAnalysis> | undefined;
    act(() => {
      pending = store.runAnalysis({
        source: "upload",
        lines: [],
        policy: DEFAULT_POLICY,
        use_ai: false,
      });
    });
    await waitFor(() => expect(store.apiStatus).toBe("loading"));
    expect(store.lines).toEqual(sample.lines);
    expect(store.analysis).toBe(result);
    await act(async () => {
      finish?.({ ...result, flagged: [] });
      await pending;
    });
    expect(store.apiStatus).toBe("ready");
    expect(store.lines).toEqual([]);
    expect(store.flagged).toEqual([]);
  });

  it("falls back without mixing results if an explicit request fails", async () => {
    mount();
    await waitFor(() => expect(store.apiStatus).toBe("ready"));
    vi.mocked(analyze).mockRejectedValueOnce(new Error("Request timed out"));
    await act(async () => {
      await expect(store.runAnalysis({ source: "bundled" })).rejects.toThrow("Request timed out");
    });
    expect(store.engine).toBe("browser");
    expect(store.lines).toBe(SYNTHETIC_LINES);
    expect(store.analysis).toBeUndefined();
  });

  it("persists engine selection and switches complete datasets in both directions", async () => {
    mount();
    await waitFor(() => expect(store.apiStatus).toBe("ready"));
    act(() => store.setEngine("browser"));
    expect(store.engine).toBe("browser");
    expect(store.lines).toBe(SYNTHETIC_LINES);
    expect(store.analysis).toBeUndefined();
    expect(JSON.parse(localStorage.getItem("claimcheck-demo-v2") ?? "{}").engine).toBe("browser");
    act(() => store.setEngine("python"));
    expect(store.engine).toBe("python");
    expect(store.lines).toEqual(sample.lines);
    expect(store.analysis).toBe(result);
    expect(JSON.parse(localStorage.getItem("claimcheck-demo-v2") ?? "{}").engine).toBe("python");
  });

  it("retries the API after selecting Python following an initial outage", async () => {
    vi.mocked(getSample).mockRejectedValueOnce(new Error("Temporary outage"));
    mount();
    await waitFor(() => expect(store.apiStatus).toBe("error"));
    act(() => store.setEngine("python"));
    await waitFor(() => expect(store.apiStatus).toBe("ready"));
    expect(store.engine).toBe("python");
    expect(store.lines).toEqual(sample.lines);
    expect(store.analysis).toBe(result);
    expect(getSample).toHaveBeenCalledTimes(2);
  });
});
