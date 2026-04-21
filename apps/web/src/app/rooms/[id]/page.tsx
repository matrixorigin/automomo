import React from "react";
import { notFound } from "next/navigation";
import { Agent } from "@automomo/protocol";
import { AppShell } from "../../../components/AppShell";
import { DataRow, DataRows } from "../../../components/DataRows";
import { EmptyState } from "../../../components/EmptyState";
import { RoomAgentJoinForm } from "../../../components/RoomAgentJoinForm";
import { RoomChatComposer } from "../../../components/RoomChatComposer";
import { RoomWorkItemForm } from "../../../components/RoomWorkItemForm";
import { Totals } from "../../../components/Totals";
import { WorkspaceHeader } from "../../../components/WorkspaceHeader";
import { getApiClient } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function RoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = getApiClient();
  const [overview, codebases, agents, rooms] = await Promise.all([
    api.getOverview(),
    api.listCodebases(),
    api.listAgents(),
    api.listRooms()
  ]);
  const room = rooms.items.find((item) => item.id === id);
  if (!room) {
    notFound();
  }
  const [roomAgents, roomMessages, roomTasks, roomWorkItems] = await Promise.all([
    api.listRoomAgents(room.id),
    api.listRoomMessages(room.id),
    api.listRoomTasks(room.id),
    api.listRoomWorkItems(room.id)
  ]);
  const codebase = codebases.find((item) => item.id === room.codebaseId);
  const joinedAgents = roomAgents.reduce<Agent[]>((items, membership) => {
    const agent = agents.find((candidate) => candidate.id === membership.agentId);
    if (agent) {
      items.push(agent);
    }
    return items;
  }, []);
  const messages = [...roomMessages].sort(byCreatedAtAsc);
  const tasks = [...roomTasks].sort(byCreatedAtDesc);

  return (
    <AppShell active="Rooms" overview={overview}>
      <WorkspaceHeader section="Rooms" title={room.name} action="Room action" />
      <section className="room-hero">
        <a className="back-link" href="/rooms">
          Back to rooms
        </a>
        <p>{room.description || codebase?.name || "Shared room context"}</p>
        <Totals
          items={[
            { label: "Agents", value: joinedAgents.length, caption: "joined" },
            { label: "Work", value: roomWorkItems.page.total, caption: "room cards" },
            { label: "Messages", value: messages.length, caption: "chat trail" }
          ]}
        />
      </section>

      <section className="room-grid">
        <div className="room-primary">
          <section className="schedule">
            <div className="floor-heading">
              <h2>
                Room chat <span>{messages.length}</span>
              </h2>
            </div>
            <RoomChatComposer roomId={room.id} agents={joinedAgents} />
            <div className="message-thread" aria-label="Room messages">
              {messages.length === 0 ? <EmptyState title="No room messages" body="Use the composer to steer agents with @mentions." /> : null}
              {messages.map((message) => (
                <article className={`message-row message-${message.author.type}`} key={message.id}>
                  <div>
                    <strong>{formatAuthor(message.author)}</strong>
                    <span>{message.createdAt}</span>
                  </div>
                  <p>{message.body}</p>
                </article>
              ))}
            </div>
          </section>

          <DataRows title="Room work" count={roomWorkItems.page.total}>
            {roomWorkItems.items.length === 0 ? <EmptyState title="No room work" body="Add durable room work to create a board card." /> : null}
            {roomWorkItems.items.map((item) => (
              <DataRow
                key={item.id}
                tone={item.status === "needs_human" ? "yellow" : item.status === "completed" ? "green" : "grey"}
                title={item.title}
                subtitle={item.body}
                code={item.id.toUpperCase()}
                status={item.status}
                meta={[
                  { label: "Priority", value: item.priority, caption: item.source },
                  { label: "Labels", value: item.labels.join(", ") || "none", caption: room.name }
                ]}
                action="Start"
              />
            ))}
          </DataRows>
        </div>

        <aside className="room-side" aria-label="Room controls">
          <section className="schedule">
            <div className="floor-heading">
              <h2>
                Agents <span>{joinedAgents.length}</span>
              </h2>
            </div>
            <RoomAgentJoinForm roomId={room.id} agents={agents} joinedAgentIds={roomAgents.map((item) => item.agentId)} />
            <div className="agent-roster">
              {joinedAgents.length === 0 ? <EmptyState title="No agents joined" body="Add an agent before sending @mentions." /> : null}
              {joinedAgents.map((agent) => (
                <div className="agent-chip" key={agent.id}>
                  <strong>@{agent.name}</strong>
                  <span>{agent.id}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="schedule">
            <div className="floor-heading">
              <h2>
                New room work <span>+</span>
              </h2>
            </div>
            <RoomWorkItemForm roomId={room.id} />
          </section>

          <DataRows title="Room subtasks" count={tasks.length}>
            {tasks.length === 0 ? <EmptyState title="No subtasks" body="Small checklist tasks linked to room work appear here." /> : null}
            {tasks.map((task) => {
              const assigned = agents.find((agent) => agent.id === task.assignedAgentId);
              const workItem = roomWorkItems.items.find((item) => item.id === task.workItemId);
              return (
                <DataRow
                  key={task.id}
                  tone={task.status === "blocked" ? "yellow" : "green"}
                  title={task.title}
                  subtitle={task.body}
                  code={task.id.toUpperCase()}
                  status={task.status}
                  meta={[
                    { label: "Agent", value: assigned?.name ?? "unassigned", caption: task.assignedAgentId ?? "none" },
                    { label: "Work", value: workItem?.title ?? "no work item", caption: task.workItemId ?? "none" }
                  ]}
                />
              );
            })}
          </DataRows>
        </aside>
      </section>
    </AppShell>
  );
}

function formatAuthor(author: { type: "human" | "agent" | "system"; name: string }) {
  return author.type === "agent" ? `Agent ${author.name}` : author.type === "human" ? `Human ${author.name}` : author.name;
}

function byCreatedAtAsc<T extends { createdAt: string }>(a: T, b: T) {
  return a.createdAt.localeCompare(b.createdAt);
}

function byCreatedAtDesc<T extends { createdAt: string }>(a: T, b: T) {
  return b.createdAt.localeCompare(a.createdAt);
}
