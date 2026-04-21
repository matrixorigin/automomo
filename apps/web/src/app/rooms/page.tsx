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
  const [overview, codebases, agents, rooms] = await Promise.all([
    api.getOverview(),
    api.listCodebases(),
    api.listAgents(),
    api.listRooms()
  ]);
  const roomList = rooms.items;
  const [roomAgents, roomMessages, roomTasks, roomWorkItems] = await Promise.all([
    Promise.all(roomList.map((room) => api.listRoomAgents(room.id))),
    Promise.all(roomList.map((room) => api.listRoomMessages(room.id))),
    Promise.all(roomList.map((room) => api.listRoomTasks(room.id))),
    Promise.all(roomList.map((room) => api.listRoomWorkItems(room.id)))
  ]);
  const roomMemberships = new Map(roomList.map((room, index) => [room.id, roomAgents[index] ?? []]));
  const roomTasksByRoom = new Map(roomList.map((room, index) => [room.id, roomTasks[index] ?? []]));
  const roomWorkItemsByRoom = new Map(roomList.map((room, index) => [room.id, roomWorkItems[index]?.items ?? []]));
  const allRoomWorkItems = roomWorkItems.flatMap((response) => response.items);
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
          { label: "Work", value: allRoomWorkItems.length, caption: "room cards" }
        ]}
      />
      <DataRows title="Rooms" count={rooms.page.total}>
        {roomList.length === 0 ? <EmptyState title="No rooms" body="Create a room to gather agents, messages, and tasks." /> : null}
        {roomList.map((room) => {
          const members = roomMemberships.get(room.id) ?? [];
          const tasks = roomTasksByRoom.get(room.id) ?? [];
          const work = roomWorkItemsByRoom.get(room.id) ?? [];
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
                {
                  label: "Work",
                  value: `${work.length} work item${work.length === 1 ? "" : "s"}`,
                  caption: work[0]?.title ?? latestTask?.title ?? "none"
                }
              ]}
              action="Open"
            />
          );
        })}
      </DataRows>
      <DataRows title="Room work" count={allRoomWorkItems.length}>
        {allRoomWorkItems.length === 0 ? <EmptyState title="No room work" body="Work items assigned to rooms will appear here." /> : null}
        {allRoomWorkItems.map((item) => {
          const room = roomList.find((candidate) => candidate.id === item.roomId);
          return (
            <DataRow
              key={item.id}
              tone={item.status === "needs_human" ? "yellow" : item.status === "completed" ? "green" : "grey"}
              title={item.title}
              subtitle={item.body}
              code={item.id.toUpperCase()}
              status={item.status}
              meta={[
                { label: "Room", value: room?.name ?? item.roomId ?? "Unassigned", caption: item.priority },
                { label: "Labels", value: item.labels.join(", ") || "none", caption: item.source }
              ]}
              action="Start"
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
      <DataRows title="Room subtasks" count={recentTasks.length}>
        {recentTasks.length === 0 ? <EmptyState title="No room subtasks" body="Small checklist tasks can be linked to room work items." /> : null}
        {recentTasks.map((task) => {
          const room = roomList.find((item) => item.id === task.roomId);
          const assigned = agents.find((agent) => agent.id === task.assignedAgentId);
          const workItem = allRoomWorkItems.find((item) => item.id === task.workItemId);
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
