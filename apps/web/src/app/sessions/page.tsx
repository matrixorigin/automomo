import { AppShell } from "@/components/AppShell";
import { DataRow, DataRows } from "@/components/DataRows";
import { EmptyState } from "@/components/EmptyState";
import { SessionDetailPanel } from "@/components/SessionDetailPanel";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { getApiClient } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const api = getApiClient();
  const [overview, sessions, workItems, agents, runtimes, rooms] = await Promise.all([
    api.getOverview(),
    api.listSessions(),
    api.listWorkItems(),
    api.listAgents(),
    api.listRuntimes(),
    api.listRooms()
  ]);
  const selected = sessions.items[0] ? await api.getSession(sessions.items[0].id) : undefined;
  return (
    <AppShell active="Sessions" overview={overview} rooms={rooms.items} agents={agents}>
      <WorkspaceHeader section="Sessions" title="Human and agent sessions" action="Open session" />
      <DataRows title="Live sessions" count={sessions.page.total}>
        {sessions.items.length === 0 ? <EmptyState title="No sessions" body="Matched work starts here once a rule routes it." /> : null}
        {sessions.items.map((session) => {
          const workItem = workItems.items.find((item) => item.id === session.workItemId);
          const agent = agents.find((item) => item.id === session.agentId);
          const runtime = runtimes.find((item) => item.id === session.runtimeId);
          return (
            <DataRow
              key={session.id}
              tone={session.status === "needs_human" ? "yellow" : "green"}
              title={workItem?.title ?? session.id}
              subtitle={`${session.participants.map((item) => item.name).join(" + ")} on ${runtime?.name ?? "runtime"}`}
              code={session.id.toUpperCase()}
              status={session.status}
              meta={[
                { label: "Agent", value: agent?.name ?? "none", caption: "participant" },
                { label: "Runtime", value: runtime?.provider ?? "unknown", caption: runtime?.mode ?? "missing" }
              ]}
              action="Inspect"
            />
          );
        })}
      </DataRows>
      {selected ? <SessionDetailPanel detail={selected} /> : null}
    </AppShell>
  );
}
