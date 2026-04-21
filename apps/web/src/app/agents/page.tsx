import { AppShell } from "@/components/AppShell";
import { AgentEditor } from "@/components/AgentEditor";
import { AgentAvatar } from "@/components/AgentAvatar";
import { DataRows } from "@/components/DataRows";
import { EmptyState } from "@/components/EmptyState";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { getApiClient } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const api = getApiClient();
  const [overview, agents, runtimes, rooms] = await Promise.all([
    api.getOverview(),
    api.listAgents(),
    api.listRuntimes(),
    api.listRooms()
  ]);
  return (
    <AppShell active="Agents" overview={overview} rooms={rooms.items} agents={agents}>
      <WorkspaceHeader section="Agents" title="Agent studio" action="New agent" />
      <section className="schedule">
        <AgentEditor runtimes={runtimes} />
      </section>
      <DataRows title="Available agents" count={agents.length}>
        {agents.length === 0 ? <EmptyState title="No agents" body="Add an agent profile before starting codebase sessions." /> : null}
        {agents.map((agent) => {
          const runtime = runtimes.find((item) => item.id === agent.defaultRuntimeId);
          return (
            <article className="schedule-row" key={agent.id}>
              <div className="asset-thumb thumb-grey">
                <AgentAvatar agent={agent} />
              </div>
              <div className="item-main">
                <strong>{agent.name}</strong>
                <small>{agent.instructions}</small>
                <span>{agent.id.toUpperCase()}</span>
              </div>
              <div className="item-meta">
                <small>Model</small>
                <strong>{agent.model ?? "default"}</strong>
                <span>{agent.maxConcurrency} slot</span>
              </div>
              <div className="item-meta">
                <small>Runtime</small>
                <strong>{runtime?.name ?? "none"}</strong>
                <span>{runtime?.provider ?? "missing"}</span>
              </div>
              <div className="row-actions">
                <button type="button">Configure</button>
                <span className="status-pill status-ready">ready</span>
              </div>
            </article>
          );
        })}
      </DataRows>
    </AppShell>
  );
}
