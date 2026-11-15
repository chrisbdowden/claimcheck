import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { API_BASE, getHealth } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { PageHeader, Panel } from "@/components/shared/ui-bits";
import { useDemo, type Settings } from "@/lib/store";
import { LogoMark } from "@/components/layout/Logo";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Settings — ClaimCheck" },
      {
        name: "description",
        content:
          "Mock organization, display, AI review and notification preferences for the ClaimCheck prototype.",
      },
      { property: "og:title", content: "Settings — ClaimCheck" },
      { property: "og:description", content: "Prototype settings for ClaimCheck." },
    ],
  }),
  component: SettingsPage,
});

function Row({
  label,
  help,
  children,
  id,
}: {
  label: string;
  help?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>
      {children}
    </div>
  );
}

function SettingsPage() {
  const { settings, updateSettings, logEvent, resetDemo, engine, setEngine, apiHealth } = useDemo();
  const healthQuery = useQuery({
    queryKey: ["claimcheck", "health"],
    queryFn: getHealth,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const health = healthQuery.data ?? apiHealth;
  const testConnection = async () => {
    const result = await healthQuery.refetch();
    if (result.error) toast.error("Connection failed", { description: result.error.message });
    else
      toast.success("Connection successful", {
        description: `ClaimCheck API · ${result.data?.status}`,
      });
  };
  const set = (s: Partial<Settings>, msg: string) => {
    updateSettings(s);
    logEvent({ type: "Settings change", note: msg });
    toast.success("Setting saved", { description: msg });
  };
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Preferences stored in this browser and detection engine connection details."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Detection engine" className="lg:col-span-2">
          <RadioGroup
            value={engine}
            aria-label="Detection engine"
            onValueChange={(value) => {
              if (value !== "python" && value !== "browser") return;
              setEngine(value);
              logEvent({ type: "Settings change", note: `Detection engine: ${value}` });
            }}
            className="gap-3"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id="engine-python" value="python" />
              <Label htmlFor="engine-python">Python engine (ClaimCheck API, recommended)</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="engine-browser" value="browser" />
              <Label htmlFor="engine-browser">Browser demo engine (offline)</Label>
            </div>
          </RadioGroup>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="sm:col-span-3">
              <dt className="text-muted-foreground">API URL</dt>
              <dd className="break-all">{API_BASE}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Version</dt>
              <dd>{health?.version ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">AI availability</dt>
              <dd>
                {health
                  ? health.ai.available
                    ? `Available · ${health.ai.model ?? health.ai.provider ?? "Claude"}`
                    : "Not configured"
                  : "—"}
              </dd>
            </div>
          </dl>
          {health && (
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              {Object.entries(health.limits).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-muted-foreground">{key.replaceAll("_", " ")}</dt>
                  <dd className="num">{value.toLocaleString("en-US")}</dd>
                </div>
              ))}
            </dl>
          )}
          <Button
            className="mt-4"
            size="sm"
            variant="outline"
            onClick={() => void testConnection()}
            disabled={healthQuery.isFetching}
          >
            {healthQuery.isFetching ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Test connection
          </Button>
          <p className="mt-2 text-sm" role="status">
            {healthQuery.error
              ? `Connection failed: ${healthQuery.error.message}`
              : healthQuery.isFetching
                ? "Testing connection…"
                : health
                  ? `Connection ready · ${health.status}`
                  : "Connection details unavailable."}
          </p>
        </Panel>
        <Panel title="Organization profile">
          <Row label="Organization name" id="org" help="Fictional demo organization">
            <Input
              id="org"
              className="h-8 w-56"
              value={settings.orgName}
              onChange={(e) => updateSettings({ orgName: e.target.value })}
              onBlur={() =>
                logEvent({
                  type: "Settings change",
                  note: `Organization name: ${settings.orgName}`,
                })
              }
            />
          </Row>
          <Row label="Fiscal year" help="Calendar year">
            <span className="text-sm">Jan – Dec</span>
          </Row>
          <Row label="Reporting currency">
            <span className="text-sm">USD</span>
          </Row>
          <Row label="User management" help="Requires real authentication">
            <Button size="sm" variant="outline" onClick={() => toast("Not available in demo")}>
              Manage users
            </Button>
          </Row>
        </Panel>
        <Panel title="Display preferences">
          <Row label="Theme">
            <RadioGroup
              value={settings.theme}
              onValueChange={(v) => set({ theme: v as Settings["theme"] }, `Theme: ${v}`)}
              className="flex gap-4"
              aria-label="Theme"
            >
              {["light", "dark"].map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <RadioGroupItem id={`t-${t}`} value={t} />
                  <Label htmlFor={`t-${t}`} className="capitalize">
                    {t}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </Row>
          <Row label="Default queue severity" help="Initial severity filter in the Exception Queue">
            <RadioGroup
              value={settings.defaultSeverity}
              onValueChange={(v) =>
                set({ defaultSeverity: v as Settings["defaultSeverity"] }, `Default severity: ${v}`)
              }
              className="flex gap-4"
              aria-label="Default severity filter"
            >
              <div className="flex items-center gap-1.5">
                <RadioGroupItem id="ds-all" value="all" />
                <Label htmlFor="ds-all">All</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem id="ds-high" value="High" />
                <Label htmlFor="ds-high">High only</Label>
              </div>
            </RadioGroup>
          </Row>
        </Panel>
        <Panel title="AI review preferences">
          <Row label="Exception explanations" id="ai1" help="Show simulated AI explanations">
            <Switch
              id="ai1"
              checked={settings.aiExplanations}
              onCheckedChange={(v) =>
                set({ aiExplanations: v }, `AI explanations ${v ? "on" : "off"}`)
              }
            />
          </Row>
          <Row
            label="Description mismatch review"
            id="ai2"
            help="Offline heuristic in this prototype"
          >
            <Switch
              id="ai2"
              checked={settings.aiMismatch}
              onCheckedChange={(v) => set({ aiMismatch: v }, `Mismatch review ${v ? "on" : "off"}`)}
            />
          </Row>
          <Row label="API keys" help="Server-managed; never entered in this app">
            <span className="text-xs text-muted-foreground">Not applicable</span>
          </Row>
        </Panel>
        <Panel title="Notification preferences">
          <Row label="New high-severity exceptions" id="n1" help="Show in the bell menu">
            <Switch
              id="n1"
              checked={settings.notifyHigh}
              onCheckedChange={(v) =>
                set({ notifyHigh: v }, `High-severity alerts ${v ? "on" : "off"}`)
              }
            />
          </Row>
          <Row label="Weekly digest email" id="n2" help="Simulated — no email is sent">
            <Switch
              id="n2"
              checked={settings.notifyDigest}
              onCheckedChange={(v) =>
                set({ notifyDigest: v }, `Weekly digest ${v ? "on" : "off"} (simulated)`)
              }
            />
          </Row>
        </Panel>
        <Panel title="Data and privacy">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>All employees, merchants and transactions are fictional.</li>
            <li>
              {engine === "python"
                ? "Synthetic CSVs are parsed locally and sent to the Python engine when analysis runs."
                : "Uploaded CSVs are parsed in the browser and never transmitted or saved."}
            </li>
            <li>
              Review statuses, notes, policy and settings live in this browser's local storage.
            </li>
            <li>The ClaimCheck API is stateless; live AI credentials stay on the server.</li>
          </ul>
          <Button
            className="mt-4"
            size="sm"
            variant="outline"
            onClick={() => {
              resetDemo();
              toast.success("Demo state cleared");
            }}
          >
            Clear local demo data
          </Button>
        </Panel>
        <Panel title="About ClaimCheck">
          <div className="flex items-start gap-3">
            <LogoMark className="h-10 w-10" />
            <div className="text-sm">
              <div className="font-semibold">ClaimCheck — AI Expense Exception Detector</div>
              <div className="text-muted-foreground">
                Every expense reviewed. Every exception explained.
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Frontend prototype v0.1 · Synthetic demo mode. Not a certified SOX control, fraud
                investigation tool, or production compliance system.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
