import { AppShell } from "@/components/AppShell";
import { AgentEditor } from "@/components/AgentEditor";
import { DataRow, DataRows } from "@/components/DataRows";
import { EmptyState } from "@/components/EmptyState";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { getApiClient } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const api = getApiClient();
  const [overview, agents, runtimes] = await Promise.all([api.getOverview(), api.listAgents(), api.listRuntimes()]);
  return (
    <AppShell active="Agents" overview={overview}>
      <WorkspaceHeader section="Agents" title="Agent studio" action="New agent" />
      <section className="schedule">
        <AgentEditor runtimes={runtimes} />
      </section>
      <DataRows title="Available agents" count={agents.length}>
        {agents.length === 0 ? <EmptyState title="No agents" body="Add an agent profile before starting codebase sessions." /> : null}
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
