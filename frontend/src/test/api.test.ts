import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE, analyze, toFlaggedLine, type ApiFlagged } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ClaimCheck API client", () => {
  it("analyze() posts the right JSON to /api/analyze", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { mode: "offline" }));
    vi.stubGlobal("fetch", fetchMock);
    const body = { source: "bundled" as const, use_ai: true };
    await analyze(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/api/analyze`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("throws with the API's detail message on a 422", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(422, { detail: "lines must be a non-empty array" })),
    );
    await expect(analyze({ source: "upload", lines: [] })).rejects.toThrow(
      "ClaimCheck API error 422: lines must be a non-empty array",
    );
  });

  it("toFlaggedLine keeps findings, relatedLineIds and reason", () => {
    const api: ApiFlagged = {
      line: {
        line_id: "L0001",
        report_id: "R1",
        employee_id: "E01",
        expense_date: "2026-03-10",
        merchant: "Cafe Luna",
        merchant_type: "Restaurant",
        category: "Meals",
        amount_usd: 120,
        receipt_attached: false,
        description: "Team lunch",
        planted_issue: "over_limit|missing_receipt",
      },
      findings: [
        {
          rule: "over_limit",
          severity: "Medium",
          explanation: "$120.00 exceeds the Meals limit of $100.00 by $20.00.",
          relatedLineIds: ["L0002"],
        },
      ],
      severity: "Medium",
      reason: "Over the Meals limit; receipt missing.",
    };
    const f = toFlaggedLine(api);
    expect(f.line.line_id).toBe("L0001");
    expect(f.severity).toBe("Medium");
    expect(f.reason).toBe("Over the Meals limit; receipt missing.");
    expect(f.findings).toHaveLength(1);
    expect(f.findings[0]!.rule).toBe("over_limit");
    expect(f.findings[0]!.relatedLineIds).toEqual(["L0002"]);
  });

  it("preserves structured 422 validation details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(422, {
          detail: [{ loc: ["body", "lines", 0, "category"], msg: "Invalid category" }],
        }),
      ),
    );
    await expect(analyze({ source: "upload", lines: [] })).rejects.toMatchObject({
      status: 422,
      detail: "body · lines · 0 · category: Invalid category",
    });
  });
});
