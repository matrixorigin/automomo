import Link from "next/link";
import type { Agent, Overview, Room, RoomStatus } from "@automomo/protocol";
import React, { ReactNode } from "react";
import { AgentAvatar } from "./AgentAvatar";
import { StatusStrip } from "./StatusStrip";

const workspaceItems = [{ href: "/", label: "Home" }];
const operationsItems = [
  { href: "/work-items", label: "Work Items" },
  { href: "/sessions", label: "Sessions" },
  { href: "/runtimes", label: "Runtimes" },
  { href: "/orchestration", label: "Orchestration" }
] as const;

export type ShellRoom = Pick<Room, "id" | "name"> & {
  status?: RoomStatus;
};
export type ShellAgent = Pick<Agent, "id" | "name"> & {
  metadata?: Agent["metadata"];
};

export function AppShell({
  active,
  activeRoomId,
  rooms = [],
  agents = [],
  children,
  overview
}: {
  active: string;
  activeRoomId?: string;
  rooms?: ShellRoom[];
  agents?: ShellAgent[];
  children: ReactNode;
  overview?: Overview;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="identity">
          <div className="mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>automomo</strong>
            <p>Codebase workspace</p>
          </div>
          <Link className={`icon-button ${active === "Settings" ? "active" : ""}`} aria-label="Settings" href="/settings">
            Setup
          </Link>
        </div>

        <div className="nav-section">
          <span>Workspace</span>
        </div>
        <nav className="nav-block" aria-label="Workspace">
          {workspaceItems.map((item) => (
            <Link key={item.href} className={itemClass(active === item.label)} href={item.href}>
              <span className="stack-icon" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="nav-section">
          <span>Rooms</span>
        </div>
        <nav className="nav-block compact" aria-label="Rooms">
          <Link className={itemClass(active === "Rooms" && !activeRoomId)} href="/rooms">
            <span className="stack-icon" aria-hidden="true" />
            All rooms
          </Link>
          {rooms.map((room) => (
            <Link key={room.id} className={itemClass(activeRoomId === room.id)} href={`/rooms/${room.id}`}>
              <span className="line-icon" aria-hidden="true" />
              {room.name}
            </Link>
          ))}
        </nav>

        <div className="nav-section">
          <span>Agents</span>
        </div>
        <nav className="nav-block compact" aria-label="Agents">
          <Link className={itemClass(active === "Agents")} href="/agents">
            <span className="doc-icon" aria-hidden="true" />
            All agents
          </Link>
          {agents.map((agent) => (
            <Link key={agent.id} className="nav-item" href={`/agents#${agent.id}`}>
              <AgentAvatar agent={{ ...agent, metadata: agent.metadata ?? {} }} />
              {agent.name}
            </Link>
          ))}
        </nav>

        <div className="nav-section">
          <span>Operations</span>
        </div>
        <nav className="nav-block compact" aria-label="Operations">
          {operationsItems.map((item) => (
            <Link key={item.href} className={itemClass(active === item.label)} href={item.href}>
              <span className="hour-icon" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="nav-section">
          <span>Settings</span>
        </div>
        <nav className="nav-block compact" aria-label="Settings">
          <Link className={itemClass(active === "Settings")} href="/settings">
            <span className="line-icon" aria-hidden="true" />
            Workspace settings
          </Link>
        </nav>

        <div className="upgrade">
          <div>
            <strong>Local runtime</strong>
            <span>Pi adapter online</span>
          </div>
          <button type="button">Pair</button>
        </div>
      </aside>

      <main className="workspace">
        <StatusStrip overview={overview} />
        {children}
      </main>
    </div>
  );
}

function itemClass(active: boolean) {
  return `nav-item ${active ? "active" : ""}`;
}
