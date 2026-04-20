import { AppShell } from "@/components/AppShell";
import { DataRow, DataRows } from "@/components/DataRows";
import { EmptyState } from "@/components/EmptyState";
import { RuleEditor } from "@/components/RuleEditor";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { getApiClient } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function OrchestrationPage() {
  const api = getApiClient();
  const [overview, agents, orchestrationRules, runtimes] = await Promise.all([
    api.getOverview(),
    api.listAgents(),
    api.listOrchestrationRules(),
    api.listRuntimes()
  ]);
  return (
    <AppShell active="Orchestration" overview={overview}>
      <WorkspaceHeader section="Orchestration" title="Routing rules" action="New rule" />
      <section className="schedule">
        <RuleEditor agents={agents} runtimes={runtimes} />
      </section>
      <DataRows title="Active rules" count={orchestrationRules.length}>
        {orchestrationRules.length === 0 ? <EmptyState title="No routing rules" body="Create a rule to send work to an agent runtime." /> : null}
        {orchestrationRules.map((rule) => {
          const agent = agents.find((item) => item.id === rule.agentId);
          const runtime = runtimes.find((item) => item.id === rule.runtimeId);
          return (
            <DataRow
              key={rule.id}
              tone={rule.humanApproval === "on_risk" ? "yellow" : "grey"}
              title={rule.name}
              subtitle={`Trigger: ${rule.trigger}; human approval: ${rule.humanApproval.replaceAll("_", " ")}`}
              code={rule.id.toUpperCase()}
              status={rule.enabled ? "ready" : "cancelled"}
              meta={[
                { label: "Agent", value: agent?.name ?? "unassigned", caption: "default" },
                { label: "Runtime", value: runtime?.name ?? "none", caption: runtime?.mode ?? "missing" }
              ]}
              action="Edit"
            />
          );
        })}
      </DataRows>
    </AppShell>
  );
}
