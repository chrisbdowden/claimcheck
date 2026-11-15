import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Database,
  UploadCloud,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Play,
  FileDown,
  Circle,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ApiError, toFlaggedLine, type ApiAnalysis } from "@/lib/api";
import { REQUIRED, validate, uploadLimitError, type Validation } from "@/lib/analysis-setup";
import { currentAiRequest } from "@/lib/ai-review";
import { Progress } from "@/components/ui/progress";
import { PageHeader, Panel, Notice, Kpi, SimLabel } from "@/components/shared/ui-bits";
import { SeverityBadge, RuleChip } from "@/components/shared/badges";
import { useDemo } from "@/lib/store";
import { downloadCsv } from "@/lib/csv";
import { runEngine, toFlagged } from "@/lib/demo-engine";
import { RULES, SEVERITY_RANK } from "@/lib/rules";
import { DATASET_NAME, SYNTHETIC_LINES } from "@/data/synthetic/dataset";
import { usd, int } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FlaggedLine } from "@/lib/types";

export const Route = createFileRoute("/analysis")({
  validateSearch: (search: Record<string, unknown>): { aiReview?: boolean } =>
    search["aiReview"] === true || search["aiReview"] === "true" ? { aiReview: true } : {},
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Expense Analysis — ClaimCheck" },
      {
        name: "description",
        content:
          "Analyze synthetic expenses with the Python engine, with an explicitly labeled offline browser fallback.",
      },
      { property: "og:title", content: "Expense Analysis — ClaimCheck" },
      {
        property: "og:description",
        content: "Python expense analysis, synthetic CSV validation, and optional live AI review.",
      },
    ],
  }),
  component: Analysis,
});

const STAGES = [
  "Validating data",
  "Applying frontend demonstration rules",
  "Preparing exceptions",
  "Generating explanations",
];

function Analysis() {
  const {
    policy,
    logEvent,
    engine,
    apiHealth,
    apiStatus,
    bundledLines,
    lines,
    analysisSource,
    runAnalysis,
  } = useDemo();
  const search = Route.useSearch();
  const aiHandoff = useRef(false);
  const [useAi, setUseAi] = useState(search.aiReview === true);
  const [requestError, setRequestError] = useState<string>();
  const python = engine === "python";
  const aiAvailable = python && apiHealth?.ai.available === true;
  const aiOn = aiAvailable && useAi;
  const stages = STAGES.map((s, i) => (python && i === 1 ? "Applying Python engine rules" : s));

  const [source, setSource] = useState<"bundled" | "upload">(
    search.aiReview ? analysisSource : "bundled",
  );
  const [v, setV] = useState<Validation | null>(
    search.aiReview && analysisSource === "upload"
      ? {
          filename: "Current synthetic dataset",
          rows: lines.length,
          parsed: lines,
          missing: [],
          invalidAmounts: [],
          dupIds: [],
          badDates: [],
        }
      : null,
  );
  const limitError =
    python && source === "upload" && v
      ? uploadLimitError(v.rows, apiHealth?.limits["max_lines"])
      : undefined;
  const [drag, setDrag] = useState(false);
  const [stage, setStage] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    source: string;
    lines: number;
    flagged: FlaggedLine[];
    api?: ApiAnalysis;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const running = stage >= 0 && stage < STAGES.length;

  const onFile = async (f: File) => {
    if (running) return;
    setResult(null);
    setRequestError(undefined);
    if (!f.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please choose a .csv file");
      return;
    }
    if (f.size > 5_000_000) {
      toast.error("File too large for local preview (5 MB max)");
      return;
    }
    const res = validate(f.name, await f.text());
    setV(res);
    if (res.fatal || res.missing.length)
      toast.error("Validation issues found", {
        description: res.fatal ?? `Missing columns: ${res.missing.join(", ")}`,
      });
    else
      toast.success(`${res.rows} rows read locally`, {
        description: "Nothing was uploaded to a server.",
      });
  };

  const canRun =
    (!python || apiStatus === "ready") &&
    !limitError &&
    (source === "bundled" || (v && !v.fatal && v.missing.length === 0 && v.parsed.length > 0));
  const run = useCallback(
    async (handoff = false) => {
      if (!canRun || running) return;
      const upload = v;
      if (source === "upload" && !upload) return;
      const data = source === "bundled" ? SYNTHETIC_LINES : (upload?.parsed ?? []);
      const name = source === "bundled" ? DATASET_NAME : (upload?.filename ?? "Synthetic upload");
      setResult(null);
      setRequestError(undefined);
      setStage(0);
      setProgress(0);
      if (python) {
        setStage(1);
        setProgress(25);
        try {
          const response = await runAnalysis(
            handoff
              ? currentAiRequest(analysisSource, lines, policy)
              : {
                  source,
                  policy,
                  use_ai: aiOn,
                  ...(source === "upload"
                    ? {
                        lines: data.map((line) => ({
                          ...line,
                          receipt_attached: Boolean(line.receipt_attached),
                        })),
                      }
                    : {}),
                },
          );
          const flagged = response.flagged
            .map(toFlaggedLine)
            .sort(
              (a, b) =>
                SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
                b.line.amount_usd - a.line.amount_usd,
            );
          setProgress(100);
          setStage(STAGES.length);
          setResult({
            source: name,
            lines: response.summary.lines_reviewed,
            flagged,
            api: response,
          });
          logEvent({
            type: "Analysis run",
            note: `Python analysis on ${name} (${response.summary.lines_reviewed} lines) — ${response.ai.used ? "live AI review" : "rules only"}.`,
          });
          toast.success("Python analysis complete", {
            description: `${response.summary.lines_flagged} lines flagged`,
          });
        } catch (error) {
          setStage(-1);
          setProgress(0);
          const message =
            error instanceof ApiError
              ? error.detail
              : error instanceof Error
                ? error.message
                : String(error);
          setRequestError(message);
          toast.error("Analysis could not complete", { description: message });
        }
        return;
      }
      let s = 0;
      const tick = () => {
        s++;
        setProgress(Math.min(100, s * 25));
        if (s < STAGES.length) {
          setStage(s);
          setTimeout(tick, 650);
        } else {
          const flagged = toFlagged(data, runEngine(data, policy)).sort(
            (a, b) =>
              SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
              b.line.amount_usd - a.line.amount_usd,
          );
          setStage(STAGES.length);
          setResult({ source: name, lines: data.length, flagged });
          logEvent({
            type: "Analysis run",
            note: `Demo analysis on ${name} (${data.length} lines) — frontend demonstration ruleset.`,
          });
          toast.success("Demo analysis complete", {
            description: `${flagged.length} lines flagged · simulated, not the Python engine`,
          });
        }
      };
      setTimeout(tick, 650);
    },
    [
      canRun,
      running,
      v,
      source,
      python,
      runAnalysis,
      analysisSource,
      lines,
      policy,
      aiOn,
      logEvent,
    ],
  );

  useEffect(() => {
    if (!search.aiReview || aiHandoff.current || !python || !aiAvailable || !canRun) return;
    aiHandoff.current = true;
    void run(true);
  }, [search.aiReview, python, aiAvailable, canRun, run]);

  const sample = () =>
    downloadCsv(
      "claimcheck_sample_synthetic.csv",
      [...REQUIRED],
      (python ? bundledLines : SYNTHETIC_LINES)
        .slice(0, 300)
        .map((l) =>
          REQUIRED.map((k) => (k === "amount_usd" ? l.amount_usd.toFixed(2) : String(l[k]))),
        ),
    );

  return (
    <>
      <PageHeader
        title="Expense Analysis"
        subtitle={
          python
            ? "Analyze synthetic expenses with the Python engine."
            : "Choose a data source, validate it, and run a simulated exception analysis using the frontend demonstration ruleset."
        }
        actions={<SimLabel>{python ? "Synthetic data" : "Simulated"}</SimLabel>}
      />
      <div className="mb-4">
        <Notice tone="warn" icon={<ShieldAlert className="h-4 w-4 text-sev-medium" />}>
          <strong>Synthetic data only.</strong> Don't upload real employee or financial records.
          {python
            ? "Files are parsed in your browser; running analysis sends synthetic rows to the Python engine. The API is stateless."
            : "Files are parsed in your browser and are never transmitted or stored."}
        </Notice>
      </div>

      <div className="grid gap-4 md:grid-cols-2" role="radiogroup" aria-label="Data source">
        {(
          [
            {
              k: "bundled",
              icon: Database,
              t: "Load bundled synthetic dataset",
              d: `${DATASET_NAME} · ${int(python ? bundledLines.length : SYNTHETIC_LINES.length)} lines · Northstar Finance Demo, Jan–Jun 2026`,
            },
            {
              k: "upload",
              icon: UploadCloud,
              t: python ? "Upload synthetic CSV" : "Upload CSV for local preview",
              d: python
                ? "Validate locally, then analyze synthetic rows with the Python engine."
                : "Browser-side parsing and validation only. No server transmission or persistence.",
            },
          ] as const
        ).map((o) => (
          <Button
            variant="outline"
            disabled={running}
            key={o.k}
            role="radio"
            aria-checked={source === o.k}
            onClick={() => {
              setSource(o.k);
              setResult(null);
              setRequestError(undefined);
              setStage(-1);
            }}
            className={cn(
              "h-auto items-start justify-start gap-3 whitespace-normal rounded-lg border bg-card p-4 text-left shadow-card transition-colors",
              source === o.k
                ? "border-teal ring-2 ring-teal/20"
                : "border-border hover:border-teal/40",
            )}
          >
            <o.icon
              className={cn(
                "mt-0.5 h-5 w-5",
                source === o.k ? "text-teal" : "text-muted-foreground",
              )}
              aria-hidden="true"
            />
            <div>
              <div className="font-medium">{o.t}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{o.d}</div>
            </div>
          </Button>
        ))}
      </div>

      {source === "upload" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel
            title="Upload CSV"
            actions={
              <Button variant="ghost" size="sm" onClick={sample}>
                <FileDown className="mr-1 h-3.5 w-3.5" />
                Sample CSV
              </Button>
            }
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files[0];
                if (f && !running) onFile(f);
              }}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                drag ? "border-teal bg-accent" : "border-border",
              )}
            >
              <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">Drag and drop a CSV here</p>
              <p className="text-xs text-muted-foreground">or</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={running}
                onClick={() => fileRef.current?.click()}
              >
                Choose file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                disabled={running}
                className="sr-only"
                aria-label="Choose CSV file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && !running) onFile(f);
                  e.target.value = "";
                }}
              />
              <p className="mt-4 max-w-sm text-[11px] text-muted-foreground">
                Required columns: {REQUIRED.join(", ")}. A <code>planted_issue</code> column, if
                present, is ignored for detection.
              </p>
            </div>
          </Panel>
          <Panel title="Validation report">
            {!v ? (
              <p className="text-sm text-muted-foreground">No file selected yet.</p>
            ) : (
              <dl className="space-y-2 text-sm" aria-live="polite">
                <Row
                  label="Filename"
                  value={<span className="font-mono text-xs">{v.filename}</span>}
                />
                <Row label="Rows" value={int(v.rows)} />
                <Check
                  ok={!v.fatal && v.missing.length === 0}
                  label="Required fields"
                  detail={
                    v.fatal ??
                    (v.missing.length ? `Missing: ${v.missing.join(", ")}` : "All 10 present")
                  }
                />
                <Check
                  ok={v.invalidAmounts.length === 0}
                  warn
                  label="Invalid amounts"
                  detail={
                    v.invalidAmounts.length
                      ? `${v.invalidAmounts.length}: ${v.invalidAmounts.slice(0, 5).join(", ")}${v.invalidAmounts.length > 5 ? "…" : ""}`
                      : "None"
                  }
                />
                <Check
                  ok={v.dupIds.length === 0}
                  warn
                  label="Duplicate line IDs"
                  detail={
                    v.dupIds.length
                      ? `${v.dupIds.length}: ${v.dupIds.slice(0, 5).join(", ")}`
                      : "None"
                  }
                />
                <Check
                  ok={v.badDates.length === 0}
                  warn
                  label="Date-format issues (YYYY-MM-DD)"
                  detail={
                    v.badDates.length
                      ? `${v.badDates.length}: ${v.badDates.slice(0, 5).join(", ")}`
                      : "None"
                  }
                />
                <Row label="Rows usable for preview" value={int(v.parsed.length)} />
                {python && (
                  <Check
                    ok={!limitError}
                    label="Server upload limit"
                    detail={limitError ?? `${apiHealth?.limits["max_lines"] ?? "—"} lines maximum`}
                  />
                )}
                {requestError && <Check ok={false} label="API validation" detail={requestError} />}
              </dl>
            )}
          </Panel>
        </div>
      )}

      <Panel
        className="mt-4"
        title="Run analysis"
        description={
          python
            ? undefined
            : "Simulated execution. Results come from a browser re-implementation of the documented rules — not a verified Python run."
        }
      >
        {python && (
          <div className="mb-4 border-b border-border pb-4">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="live-ai" className="text-sm font-medium">
                Use live AI review (Claude) for explanations and description checks
              </label>
              <Switch
                id="live-ai"
                checked={aiOn}
                onCheckedChange={setUseAi}
                disabled={!aiAvailable || running}
                aria-describedby="live-ai-hint"
              />
            </div>
            <p id="live-ai-hint" className="mt-2 text-xs text-muted-foreground">
              {!aiAvailable && (
                <span className="block">Live AI isn't configured on the server.</span>
              )}
              Limited to {apiHealth?.limits["ai_per_visitor"] ?? "—"} runs per{" "}
              {apiHealth?.limits["ai_window_minutes"] ?? "—"} minutes per visitor. Falls back to
              rules if a limit applies.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <Button
            onClick={() => void run()}
            disabled={!canRun || running}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {running ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-4 w-4" />
            )}
            {python ? "Run Analysis" : "Run Demo Analysis"}
          </Button>
          <div className="flex-1">
            <Progress value={progress} aria-label="Analysis progress" className="h-2" />
            <ol className="mt-2 grid grid-cols-2 gap-1 text-xs sm:grid-cols-4" aria-live="polite">
              {stages.map((s, i) => (
                <li
                  key={s}
                  className={cn(
                    "flex items-center gap-1",
                    i < stage || stage === STAGES.length
                      ? "text-success"
                      : i === stage
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {i < stage || stage === STAGES.length ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : i === stage ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Circle className="h-3.5 w-3.5" />
                  )}
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
        {running && python && (
          <div className="mt-3 text-sm" role="status">
            Running on the Python engine…
            {aiOn && (
              <p className="mt-1 text-xs text-muted-foreground">
                AI review can take up to a minute
              </p>
            )}
          </div>
        )}
        {requestError && source === "bundled" && (
          <div className="mt-3">
            <Notice tone="warn" icon={<AlertTriangle className="h-4 w-4" />}>
              {requestError}
            </Notice>
          </div>
        )}
        {!canRun && !running && source === "upload" && (
          <p className="mt-3 text-xs text-muted-foreground">
            {limitError ?? "Select a CSV that passes required-field validation to enable the run."}
          </p>
        )}
      </Panel>

      {result && (
        <section className="mt-4 space-y-4" aria-label="Analysis summary">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <strong>Analysis complete</strong>
            <span className="text-muted-foreground">
              · {result.source} · {result.api ? "Python engine" : "frontend demonstration ruleset"}
            </span>
          </div>
          {result.api && (
            <>
              <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Mode</dt>
                  <dd className="font-medium">
                    {result.api.ai.used
                      ? `AI review · ${result.api.ai.model ?? "Claude"}`
                      : "Rules only"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Response time</dt>
                  <dd>{result.api.summary.seconds.toFixed(2)} seconds</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cached</dt>
                  <dd>{result.api.cached ? "Yes" : "No"}</dd>
                </div>
              </dl>
              {result.api.notes.map((note, i) => (
                <Notice key={i} icon={<Info className="h-4 w-4" />}>
                  {note}
                </Notice>
              ))}
            </>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Lines analyzed" value={int(result.lines)} />
            <Kpi
              label="Lines flagged"
              value={int(result.api?.summary.lines_flagged ?? result.flagged.length)}
              sub={`${int(result.flagged.reduce((s, f) => s + f.findings.length, 0))} rule-level findings`}
            />
            <Kpi
              label="Dollars flagged"
              value={usd(
                result.api?.summary.dollars_flagged ??
                  result.flagged.reduce((s, f) => s + f.line.amount_usd, 0),
                0,
              )}
            />
            <Kpi
              label="High severity"
              value={int(
                result.api?.summary.high_severity ??
                  result.flagged.filter((f) => f.severity === "High").length,
              )}
            />
          </div>
          <Panel title="Findings by rule">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {RULES.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs"
                >
                  <RuleChip rule={r.id} />
                  <span className="num font-semibold">
                    {result.api?.summary.flags_by_rule[r.id] ??
                      result.flagged.filter((f) => f.findings.some((x) => x.rule === r.id)).length}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            title="Top exceptions"
            bodyClassName="p-0"
            actions={
              (source === "bundled" || result.api) && (
                <Button asChild size="sm" variant="outline">
                  <Link to="/exceptions">Open Exception Queue</Link>
                </Button>
              )
            }
          >
            <ul className="divide-y divide-border">
              {result.flagged.slice(0, 8).map((f) => (
                <li key={f.line.line_id} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <span className="font-mono text-xs">{f.line.line_id}</span>
                    <span>{f.line.merchant}</span>
                    <span className="num ml-auto font-medium">{usd(f.line.amount_usd)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{f.findings[0]?.explanation}</p>
                </li>
              ))}
              {result.flagged.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No exceptions found under the current policy.
                </li>
              )}
            </ul>
          </Panel>
        </section>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function Check({
  ok,
  warn,
  label,
  detail,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
  detail: string;
}) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  return (
    <div className="flex items-start gap-2">
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          ok ? "text-success" : warn ? "text-sev-medium" : "text-sev-high",
        )}
        aria-hidden="true"
      />
      <div>
        <dt className="font-medium">
          {label} <span className="sr-only">{ok ? "passed" : "issues found"}</span>
        </dt>
        <dd className="text-xs text-muted-foreground">{detail}</dd>
      </div>
    </div>
  );
}
