import { createFileRoute } from "@tanstack/react-router";
import { Cpu, Sparkles } from "lucide-react";
import { PageHeader, Panel, SimLabel } from "@/components/shared/ui-bits";
import { SeverityBadge } from "@/components/shared/badges";
import { RULES } from "@/lib/rules";
import { useDemo } from "@/lib/store";

export const Route = createFileRoute("/rules")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Detection Rule Library — ClaimCheck" },
      {
        name: "description",
        content:
          "The ten ClaimCheck detection rules: purpose, matching conditions, policy dependencies and examples.",
      },
      { property: "og:title", content: "Detection Rule Library — ClaimCheck" },
      {
        property: "og:description",
        content: "Nine deterministic rules and one AI-assisted check.",
      },
    ],
  }),
  component: Rules,
});

function Rules() {
  const { flagged, engine, apiHealth } = useDemo();
  const python = engine === "python";
  const rules = python
    ? (apiHealth?.rules ?? []).map((rule) => ({
        ...RULES.find((local) => local.id === rule.id),
        id: rule.id,
        name: rule.label,
        severity: rule.severity,
      }))
    : RULES;
  const count = (id: string) => flagged.filter((f) => f.findings.some((x) => x.rule === id)).length;
  const groups = [
    {
      title: "Deterministic rules",
      icon: Cpu,
      desc: "Fixed, explainable policy checks. These identify most exceptions.",
      items: rules.filter((r) => r.kind === "Deterministic"),
    },
    {
      title: "AI-assisted / offline heuristic",
      icon: Sparkles,
      desc: python
        ? "Description checks run on the server, using live AI when requested and available, or offline rules otherwise."
        : "Interpretive check. Offline keyword heuristic in this prototype; an AI provider is simulated only.",
      items: rules.filter((r) => r.kind !== "Deterministic"),
    },
  ];
  return (
    <>
      <PageHeader
        title="Detection Rule Library"
        subtitle="What each rule looks for, what policy it depends on, and how often it fires on the demo dataset under current policy."
        actions={python ? undefined : <SimLabel>Simulated finding counts</SimLabel>}
      />
      {python && (
        <p className="mb-4 text-sm text-muted-foreground">
          Rules run in the Python engine; the browser copy is a fallback.
        </p>
      )}
      {groups.map((g) => (
        <section key={g.title} className="mb-6">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <g.icon className="h-4 w-4 text-teal" />
            {g.title}
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">{g.desc}</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {g.items.map((r, i) => (
              <Panel
                key={r.id}
                title={
                  <span className="flex items-center gap-2">
                    <span className="num text-muted-foreground">{rules.indexOf(r) + 1}.</span>
                    {r.name}
                  </span>
                }
                actions={<SeverityBadge severity={r.severity} />}
              >
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Business purpose
                    </dt>
                    <dd>{r.purpose}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Matching conditions
                    </dt>
                    <dd>{r.conditions}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Policy dependencies
                    </dt>
                    <dd>{r.dependencies}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Example
                    </dt>
                    <dd className="text-muted-foreground">{r.example}</dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <dt className="text-xs text-muted-foreground">
                      {python ? "Findings" : "Simulated findings"}
                    </dt>
                    <dd className="num text-lg font-semibold" data-i={i}>
                      {count(r.id)}
                    </dd>
                  </div>
                </dl>
              </Panel>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
