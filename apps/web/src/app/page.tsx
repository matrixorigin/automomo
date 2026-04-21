import { AppShell } from "../components/AppShell";
import { DataRow, DataRows } from "../components/DataRows";
import { EmptyState } from "../components/EmptyState";
import { Totals } from "../components/Totals";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import { getApiClient } from "../lib/api";
import React from "react";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const api = getApiClient();
  const [overview, rooms, agents, sessions, workItems] = await Promise.all([
    api.getOverview(),
    api.listRooms(),
    api.listAgents(),
    api.listSessions(),
    api.listWorkItems()
  ]);
  const activeRooms = rooms.items.filter((room) => room.status === "active");
  const roomNames = new Map(rooms.items.map((room) => [room.id, room.name]));
  const activeSessions = sessions.items.filter((session) => ["queued", "running", "needs_human"].includes(session.status));
  const handoffItems = workItems.items.filter((item) => item.status === "needs_human");
  const roomMessages = (
    await Promise.all(
      activeRooms.slice(0, 6).map(async (room) => ({
        roomId: room.id,
        roomName: room.name,
        messages: await api.listRoomMessages(room.id)
      }))
    )
  )
    .flatMap((entry) =>
      entry.messages.map((message) => ({
        ...message,
        roomId: entry.roomId,
        roomName: entry.roomName
      }))
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);
  const runtimeHealth = [
    { key: "online", label: "Online runtimes", value: overview.runtimeHealth.online ?? 0, status: "running" },
    { key: "busy", label: "Busy runtimes", value: overview.runtimeHealth.busy ?? 0, status: "needs_human" },
    { key: "unhealthy", label: "Unhealthy runtimes", value: overview.runtimeHealth.unhealthy ?? 0, status: "failed" }
  ] as const;

  return (
    <AppShell active="Home" overview={overview} rooms={rooms.items} agents={agents}>
      <WorkspaceHeader section="Home" title="Rooms home" action={{ label: "Open rooms", href: "/rooms" }} />
      <Totals
        items={[
          { label: "Active rooms", value: activeRooms.length, caption: "collaboration spaces" },
          { label: "Active sessions", value: activeSessions.length, caption: "running now" },
          { label: "Handoffs", value: handoffItems.length, caption: "needs human" }
        ]}
      />
      <DataRows title="Active rooms" count={activeRooms.length}>
        {activeRooms.length === 0 ? (
          <EmptyState title="No active rooms" body="Create or reactivate a room to start shared work." action="Open rooms" />
        ) : null}
        {activeRooms.map((room) => (
          <DataRow
            key={room.id}
            tone={room.status === "active" ? "green" : "grey"}
            title={room.name}
            subtitle={room.description || "Shared room workspace"}
            code={room.id.toUpperCase()}
            status={room.status}
            meta={[
              {
                label: "Work",
                value: String(workItems.items.filter((item) => item.roomId === room.id).length),
                caption: "tracked items"
              },
              {
                label: "Sessions",
                value: String(activeSessions.filter((session) => session.roomId === room.id).length),
                caption: "currently active"
              }
            ]}
            action="Open room"
            actionHref={`/rooms/${room.id}`}
          />
        ))}
      </DataRows>
      <DataRows title="Recent room messages" count={roomMessages.length}>
        {roomMessages.length === 0 ? (
          <EmptyState title="No room messages" body="Recent room conversation appears here once teams begin chatting." />
        ) : null}
        {roomMessages.map((message) => (
          <DataRow
            key={message.id}
            tone="grey"
            title={message.roomName}
            subtitle={message.body}
            code={message.id.toUpperCase()}
            status="ready"
            meta={[
              { label: "Author", value: message.author.name, caption: message.author.type },
              { label: "Posted", value: toDisplayTime(message.createdAt), caption: "latest first" }
            ]}
            action="Open room"
            actionHref={`/rooms/${message.roomId}`}
          />
        ))}
      </DataRows>
      <DataRows title="Active sessions" count={activeSessions.length}>
        {activeSessions.length === 0 ? (
          <EmptyState title="No active sessions" body="Sessions appear here when work is routed to agents." />
        ) : null}
        {activeSessions.map((session) => (
          <DataRow
            key={session.id}
            tone={session.status === "needs_human" ? "yellow" : "green"}
            title={roomNames.get(session.roomId ?? "") ?? "Unassigned room"}
            subtitle={session.participants.map((participant) => participant.name).join(" + ")}
            code={session.id.toUpperCase()}
            status={session.status}
            meta={[
              { label: "Agent", value: session.agentId ?? "none", caption: "assigned" },
              { label: "Runtime", value: session.runtimeId ?? "none", caption: "execution" }
            ]}
            action={session.roomId ? "Open room" : "View rooms"}
            actionHref={session.roomId ? `/rooms/${session.roomId}` : "/rooms"}
          />
        ))}
      </DataRows>
      <DataRows title="Handoffs needing attention" count={handoffItems.length}>
        {handoffItems.length === 0 ? (
          <EmptyState title="No handoffs" body="Human approval requests are shown here." />
        ) : null}
        {handoffItems.map((item) => (
          <DataRow
            key={item.id}
            tone="yellow"
            title={item.title}
            subtitle={item.body}
            code={item.id.toUpperCase()}
            status={item.status}
            meta={[
              { label: "Room", value: roomNames.get(item.roomId ?? "") ?? "Unassigned", caption: item.roomId ?? "needs room" },
              { label: "Priority", value: item.priority, caption: item.source }
            ]}
            action={item.roomId ? "Open room" : "View rooms"}
            actionHref={item.roomId ? `/rooms/${item.roomId}` : "/rooms"}
          />
        ))}
      </DataRows>
      <DataRows title="Runtime health" count={runtimeHealth.length}>
        {runtimeHealth.map((health) => (
          <DataRow
            key={health.key}
            tone={health.value === 0 ? "grey" : health.key === "unhealthy" ? "yellow" : "green"}
            title={health.label}
            subtitle="Reusable environments supporting room work"
            code={health.key.toUpperCase()}
            status={health.status}
            meta={[
              { label: "Count", value: String(health.value), caption: "from overview" },
              { label: "Daemon pool", value: String(overview.daemonCount), caption: "registered" }
            ]}
            action="Open runtimes"
            actionHref="/runtimes"
          />
        ))}
      </DataRows>
      <DataRows title="Recent events" count={overview.recentEvents.length}>
        {overview.recentEvents.length === 0 ? (
          <EmptyState title="No events yet" body="Session events appear here as room work progresses." />
        ) : null}
        {overview.recentEvents.slice(0, 8).map((event) => (
          <DataRow
            key={event.id}
            tone={event.kind === "failure" || event.kind === "handoff" ? "yellow" : "grey"}
            title={event.summary}
            subtitle={event.detail ?? `Event in session ${event.sessionId}`}
            code={event.id.toUpperCase()}
            status={event.kind === "failure" ? "failed" : event.kind === "handoff" ? "needs_human" : "running"}
            meta={[
              { label: "Kind", value: event.kind, caption: "session event" },
              { label: "When", value: toDisplayTime(event.createdAt), caption: event.actor?.name ?? "system" }
            ]}
            />
        ))}
      </DataRows>
    </AppShell>
  );
}

function toDisplayTime(value: string) {
  return value.replace("T", " ").slice(0, 16);
}
