import React from "react";
import { AppShell } from "../../components/AppShell";
import { DataRow, DataRows } from "../../components/DataRows";
import { EmptyState } from "../../components/EmptyState";
import { RoomEditor } from "../../components/RoomEditor";
import { Totals } from "../../components/Totals";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { getApiClient } from "../../lib/api";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const api = getApiClient();
  const [overview, codebases, agents, rooms, workItems] = await Promise.all([
    api.getOverview(),
    api.listCodebases(),
    api.listAgents(),
    api.listRooms(),
    api.listWorkItems()
  ]);
  const roomList = rooms.items;
  const [roomAgents, roomMessages, roomTasks] = await Promise.all([
    Promise.all(roomList.map((room) => api.listRoomAgents(room.id))),
    Promise.all(roomList.map((room) => api.listRoomMessages(room.id))),
    Promise.all(roomList.map((room) => api.listRoomTasks(room.id)))
  ]);
  const roomMemberships = new Map(roomList.map((room, index) => [room.id, roomAgents[index] ?? []]));
  const roomMessagesByRoom = new Map(roomList.map((room, index) => [room.id, roomMessages[index] ?? []]));
  const roomTasksByRoom = new Map(roomList.map((room, index) => [room.id, roomTasks[index] ?? []]));
  const recentMessages = [...roomMessages.flat()].sort(byCreatedAtDesc).slice(0, 5);
  const recentTasks = [...roomTasks.flat()].sort(byCreatedAtDesc).slice(0, 5);

  return (
    <AppShell active="Rooms" overview={overview}>
      <WorkspaceHeader section="Rooms" title="Room collaboration" action="New room" />
      <section className="schedule">
        <RoomEditor codebases={codebases} />
      </section>
      <Totals
        items={[
          { label: "Rooms", value: roomList.length, caption: "shared spaces" },
          { label: "Members", value: [...roomMemberships.values()].reduce((sum, items) => sum + items.length, 0), caption: "agent joins" },
          { label: "Tasks", value: roomTasks.flat().length, caption: "room work" }
        ]}
      />
      <DataRows title="Rooms" count={rooms.page.total}>
        {roomList.length === 0 ? <EmptyState title="No rooms" body="Create a room to gather agents, messages, and tasks." /> : null}
        {roomList.map((room) => {
          const members = roomMemberships.get(room.id) ?? [];
          const messages = roomMessagesByRoom.get(room.id) ?? [];
          const tasks = roomTasksByRoom.get(room.id) ?? [];
          const latestMessage = messages[0];
          const latestTask = tasks[0];
          const codebase = codebases.find((item) => item.id === room.codebaseId);
          return (
            <DataRow
              key={room.id}
              tone={room.status === "active" ? "green" : "grey"}
              title={room.name}
              subtitle={room.description || codebase?.name || "Room context"}
              code={room.id.toUpperCase()}
              status={room.status}
              meta={[
                {
                  label: "Members",
                  value: `${members.length} agent${members.length === 1 ? "" : "s"}`,
                  caption: members.map((item) => item.agentId).join(", ") || "none"
                },
                { label: "Recent", value: latestMessage ? formatAuthor(latestMessage.author) : "none", caption: latestTask?.title ?? "no tasks" }
              ]}
              action="Open"
            />
          );
        })}
      </DataRows>
      <DataRows title="Recent messages" count={recentMessages.length}>
        {recentMessages.length === 0 ? <EmptyState title="No messages" body="Room messages will appear here as agents and humans coordinate." /> : null}
        {recentMessages.map((message) => {
          const room = roomList.find((item) => item.id === message.roomId);
          return (
            <DataRow
              key={message.id}
              tone="grey"
              title={message.body}
              subtitle={formatAuthor(message.author)}
              code={message.id.toUpperCase()}
              status={message.author.type}
              meta={[
                { label: "Room", value: room?.name ?? message.roomId, caption: room?.codebaseId ?? "codebase" },
                { label: "Kind", value: message.author.type, caption: "author" }
              ]}
            />
          );
        })}
      </DataRows>
      <DataRows title="Room tasks" count={recentTasks.length}>
        {recentTasks.length === 0 ? <EmptyState title="No room tasks" body="Tasks assigned inside a room show up here." /> : null}
        {recentTasks.map((task) => {
          const room = roomList.find((item) => item.id === task.roomId);
          const assigned = agents.find((agent) => agent.id === task.assignedAgentId);
          const workItem = workItems.items.find((item) => item.id === task.workItemId);
          return (
            <DataRow
              key={task.id}
              tone={task.status === "blocked" ? "yellow" : "green"}
              title={task.title}
              subtitle={task.body}
              code={task.id.toUpperCase()}
              status={task.status}
              meta={[
                { label: "Room", value: room?.name ?? task.roomId, caption: room?.codebaseId ?? "codebase" },
                { label: "Agent", value: assigned?.name ?? "unassigned", caption: workItem?.title ?? "no work item" }
              ]}
            />
          );
        })}
      </DataRows>
    </AppShell>
  );
}

function formatAuthor(author: { type: "human" | "agent" | "system"; name: string }) {
  return author.type === "agent" ? `Agent ${author.name}` : author.type === "human" ? `Human ${author.name}` : author.name;
}

function byCreatedAtDesc<T extends { createdAt: string }>(a: T, b: T) {
  return b.createdAt.localeCompare(a.createdAt);
}
