import React from "react";
import { Agent } from "@automomo/protocol";
import { notFound } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { DataRow, DataRows } from "../../../components/DataRows";
import { EmptyState } from "../../../components/EmptyState";
import { RoomAgentJoinForm } from "../../../components/RoomAgentJoinForm";
import { RoomChatComposer } from "../../../components/RoomChatComposer";
import { RoomHeader } from "../../../components/RoomHeader";
import { RoomRuntimePresence } from "../../../components/RoomRuntimePresence";
import { RoomWorkItemForm } from "../../../components/RoomWorkItemForm";
import { RoomWorkspace } from "../../../components/RoomWorkspace";
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

  const [roomAgents, roomMessages, roomTasks, roomWorkItems, roomSessions, runtimes] = await Promise.all([
    api.listRoomAgents(room.id),
    api.listRoomMessages(room.id),
    api.listRoomTasks(room.id),
    api.listRoomWorkItems(room.id),
    api.listSessions({ roomId: room.id }),
    api.listRuntimes()
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
  const sessions = [...roomSessions.items].sort(byCreatedAtDesc);
  const outcomes = sessions.filter((session) => Boolean(session.outcomeId));

  return (
    <AppShell active="Rooms" activeRoomId={room.id} overview={overview} rooms={rooms.items} agents={agents}>
      <RoomWorkspace
        header={
          <RoomHeader
            roomName={room.name}
            roomDescription={room.description || codebase?.name || "Shared room context"}
            joinedAgentCount={joinedAgents.length}
            runtimePresence={<RoomRuntimePresence runtimes={runtimes} sessions={sessions} />}
          />
        }
        chatContent={
          <section className="schedule">
            <div className="floor-heading">
              <h2>
                Room chat <span>{messages.length}</span>
              </h2>
            </div>
            <RoomChatComposer roomId={room.id} agents={joinedAgents} initialMessages={messages} />
            <div className="room-tab-support">
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
            </div>
          </section>
        }
        boardContent={
          <section className="schedule">
            <div className="floor-heading">
              <h2>
                Create room work item <span>+</span>
              </h2>
            </div>
            <RoomWorkItemForm roomId={room.id} />
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
          </section>
        }
        sessionsContent={
          <section className="schedule">
            <div className="floor-heading">
              <h2>
                Room sessions <span>{sessions.length}</span>
              </h2>
            </div>
            {sessions.length === 0 ? <EmptyState title="No sessions yet" body="Sessions attached to this room will appear here." /> : null}
            {sessions.map((session) => (
              <article className="session-row" key={session.id}>
                <div>
                  <strong>{session.id.toUpperCase()}</strong>
                  <span>{session.status}</span>
                </div>
                <p>Runtime: {session.runtimeId ?? "unassigned"}</p>
              </article>
            ))}
          </section>
        }
        outcomesContent={
          <section className="schedule">
            <div className="floor-heading">
              <h2>
                Room outcomes <span>{outcomes.length}</span>
              </h2>
            </div>
            {outcomes.length === 0 ? <EmptyState title="No outcomes yet" body="Session outcomes will be summarized here." /> : null}
            {outcomes.map((session) => (
              <article className="session-row" key={session.id}>
                <div>
                  <strong>{session.id.toUpperCase()}</strong>
                  <span>{session.outcomeId}</span>
                </div>
                <p>Status: {session.status}</p>
              </article>
            ))}
          </section>
        }
      />
    </AppShell>
  );
}

function byCreatedAtAsc<T extends { createdAt: string }>(a: T, b: T) {
  return a.createdAt.localeCompare(b.createdAt);
}

function byCreatedAtDesc<T extends { createdAt: string }>(a: T, b: T) {
  return b.createdAt.localeCompare(a.createdAt);
}
