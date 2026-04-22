import React from "react";
import { AppShell } from "../../components/AppShell";
import { EmptyState } from "../../components/EmptyState";
import { RoomEditor } from "../../components/RoomEditor";
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
    <AppShell active="Rooms" overview={overview} rooms={rooms.items} agents={agents}>
      <div className="workspace-page">
        <WorkspaceHeader section="Rooms" title="Rooms" action={{ label: "New room", href: "#new-room" }} />
        <section className="rooms-index">
          <div className="rooms-index-main">
            <div className="rooms-index-summary" aria-label="Room summary">
              <div>
                <span>Rooms</span>
                <strong>{roomList.length}</strong>
              </div>
              <div>
                <span>Members</span>
                <strong>{[...roomMemberships.values()].reduce((sum, items) => sum + items.length, 0)}</strong>
              </div>
              <div>
                <span>Work</span>
                <strong>{allRoomWorkItems.length}</strong>
              </div>
            </div>

            <div className="room-card-list">
              {roomList.length === 0 ? <EmptyState title="No rooms" body="Create a room to gather agents, messages, and tasks." /> : null}
              {roomList.map((room) => {
                const members = roomMemberships.get(room.id) ?? [];
                const tasks = roomTasksByRoom.get(room.id) ?? [];
                const work = roomWorkItemsByRoom.get(room.id) ?? [];
                const latestTask = tasks[0];
                const codebase = codebases.find((item) => item.id === room.codebaseId);
                return (
                  <article className="room-directory-card" key={room.id}>
                    <div className="room-directory-mark" aria-hidden="true">
                      #
                    </div>
                    <div className="room-directory-copy">
                      <div className="room-directory-title">
                        <h2>{room.name}</h2>
                        <span className={`status-pill status-${room.status}`}>{room.status}</span>
                      </div>
                      <p>{room.description || codebase?.name || "Room context"}</p>
                      <div className="room-directory-meta">
                        <span>{codebase?.name ?? room.codebaseId}</span>
                        <span>{members.length} agents</span>
                        <span>{work.length} work items</span>
                      </div>
                    </div>
                    <div className="room-directory-activity">
                      <span>Latest</span>
                      <strong>{work[0]?.title ?? latestTask?.title ?? "No activity yet"}</strong>
                    </div>
                    <a className="room-directory-open" href={`/rooms/${room.id}`}>
                      Open
                    </a>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="rooms-index-side" aria-label="Room controls and activity">
            <section className="room-create-panel" id="new-room">
              <header>
                <h2>New room</h2>
              </header>
              <RoomEditor codebases={codebases} />
            </section>

            <section className="rooms-activity-panel">
              <header>
                <h2>Room work</h2>
                <span>{allRoomWorkItems.length}</span>
              </header>
              <div className="rooms-activity-list">
                {allRoomWorkItems.length === 0 ? <EmptyState title="No room work" body="Work items assigned to rooms will appear here." /> : null}
                {allRoomWorkItems.slice(0, 5).map((item) => {
                  const room = roomList.find((candidate) => candidate.id === item.roomId);
                  return (
                    <article className="rooms-activity-item" key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                      <span>{room?.name ?? item.roomId ?? "Unassigned"} / {item.status.replaceAll("_", " ")}</span>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rooms-activity-panel">
              <header>
                <h2>Recent messages</h2>
                <span>{recentMessages.length}</span>
              </header>
              <div className="rooms-activity-list">
                {recentMessages.length === 0 ? <EmptyState title="No messages" body="Room messages will appear here as agents and humans coordinate." /> : null}
                {recentMessages.map((message) => {
                  const room = roomList.find((item) => item.id === message.roomId);
                  return (
                    <article className="rooms-activity-item" key={message.id}>
                      <strong>{formatAuthor(message.author)}</strong>
                      <p>{message.body}</p>
                      <span>{room?.name ?? message.roomId}</span>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rooms-activity-panel">
              <header>
                <h2>Room subtasks</h2>
                <span>{recentTasks.length}</span>
              </header>
              <div className="rooms-activity-list">
                {recentTasks.length === 0 ? <EmptyState title="No subtasks" body="Small checklist tasks can be linked to room work items." /> : null}
                {recentTasks.map((task) => {
                  const assigned = agents.find((agent) => agent.id === task.assignedAgentId);
                  return (
                    <article className="rooms-activity-item" key={task.id}>
                      <strong>{task.title}</strong>
                      <p>{task.body}</p>
                      <span>{assigned?.name ?? "unassigned"} / {task.status.replaceAll("_", " ")}</span>
                    </article>
                  );
                })}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}

function formatAuthor(author: { type: "human" | "agent" | "system"; name: string }) {
  return author.type === "agent" ? `Agent ${author.name}` : author.type === "human" ? `Human ${author.name}` : author.name;
}

function byCreatedAtDesc<T extends { createdAt: string }>(a: T, b: T) {
  return b.createdAt.localeCompare(a.createdAt);
}
