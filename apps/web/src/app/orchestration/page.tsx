import { AppShell } from "../../components/AppShell";
import { DataRow, DataRows } from "../../components/DataRows";
import { EmptyState } from "../../components/EmptyState";
import { RuleEditor } from "../../components/RuleEditor";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { getApiClient } from "../../lib/api";
import React from "react";

export const dynamic = "force-dynamic";

export default async function OrchestrationPage() {
  const api = getApiClient();
  const [overview, codebases, agents, orchestrationRules, runtimes, rooms] = await Promise.all([
    api.getOverview(),
    api.listCodebases(),
    api.listAgents(),
    api.listOrchestrationRules(),
    api.listRuntimes(),
    api.listRooms()
  ]);
  return (
    <AppShell active="Orchestration" overview={overview} rooms={rooms.items} agents={agents}>
      <WorkspaceHeader section="Orchestration" title="Rules automate room work" />
      <section className="schedule">
        <RuleEditor codebases={codebases} agents={agents} runtimes={runtimes} />
      </section>
      <DataRows title="Active rules" count={orchestrationRules.length}>
        {orchestrationRules.length === 0 ? <EmptyState title="No room rules" body="Create a rule to route room work to an agent runtime." /> : null}
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
