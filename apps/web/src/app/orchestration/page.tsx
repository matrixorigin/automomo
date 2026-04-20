import { AppShell } from "@/components/AppShell";
import { DataRow, DataRows } from "@/components/DataRows";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { agents, orchestrationRules, runtimes } from "@/lib/mock-data";

export default function OrchestrationPage() {
  return (
    <AppShell active="Orchestration">
      <WorkspaceHeader section="Orchestration" title="Routing rules" action="New rule" />
      <DataRows title="Active rules" count={orchestrationRules.length}>
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
