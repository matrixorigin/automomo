import { AppShell } from "@/components/AppShell";
import { DataRow, DataRows } from "@/components/DataRows";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { agents, runtimes } from "@/lib/mock-data";

export default function AgentsPage() {
  return (
    <AppShell active="Agents">
      <WorkspaceHeader section="Agents" title="Agent studio" action="New agent" />
      <DataRows title="Available agents" count={agents.length}>
        {agents.map((agent) => {
          const runtime = runtimes.find((item) => item.id === agent.defaultRuntimeId);
          return (
            <DataRow
              key={agent.id}
              title={agent.name}
              subtitle={agent.instructions}
              code={agent.id.toUpperCase()}
              status="ready"
              meta={[
                { label: "Model", value: agent.model ?? "default", caption: `${agent.maxConcurrency} slot` },
                { label: "Runtime", value: runtime?.name ?? "none", caption: runtime?.provider ?? "missing" }
              ]}
              action="Configure"
            />
          );
        })}
      </DataRows>
    </AppShell>
  );
}
