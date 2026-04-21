import { AppShell } from "../../components/AppShell";
import { DataRow, DataRows } from "../../components/DataRows";
import { EmptyState } from "../../components/EmptyState";
import { SessionDetailPanel } from "../../components/SessionDetailPanel";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { getApiClient } from "../../lib/api";
import React from "react";

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
  const roomNames = new Map(rooms.items.map((room) => [room.id, room.name]));
  return (
    <AppShell active="Sessions" overview={overview} rooms={rooms.items} agents={agents}>
      <WorkspaceHeader section="Sessions" title="Session history" action={{ label: "Open rooms", href: "/rooms" }} />
      <DataRows title="Operations history" count={sessions.page.total}>
        {sessions.items.length === 0 ? <EmptyState title="No sessions" body="Matched work starts here once a rule routes it." /> : null}
        {sessions.items.map((session) => {
          const workItem = workItems.items.find((item) => item.id === session.workItemId);
          const agent = agents.find((item) => item.id === session.agentId);
          const runtime = runtimes.find((item) => item.id === session.runtimeId);
          const roomName = roomNames.get(session.roomId ?? "") ?? "Unassigned";
          return (
            <DataRow
              key={session.id}
              tone={session.status === "needs_human" ? "yellow" : session.status === "running" ? "green" : "grey"}
              title={workItem?.title ?? session.id}
              subtitle={`${roomName} • ${session.participants.map((item) => item.name).join(" + ")}`}
              code={session.id.toUpperCase()}
              status={session.status}
              meta={[
                { label: "Room", value: roomName, caption: session.roomId ?? "none" },
                { label: "Agent", value: agent?.name ?? "none", caption: "participant" },
                { label: "Runtime", value: runtime?.name ?? "unknown", caption: runtime?.mode ?? "missing" }
              ]}
              action={session.roomId ? "Open room" : "View rooms"}
              actionHref={session.roomId ? `/rooms/${session.roomId}` : "/rooms"}
            />
          );
        })}
      </DataRows>
      {selected ? <SessionDetailPanel detail={selected} /> : null}
    </AppShell>
  );
}
