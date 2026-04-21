import React from "react";
import { Agent, Runtime, Session, SessionDetailResponse, WorkItem } from "@automomo/protocol";
import { EmptyState } from "./EmptyState";
import { HandoffControls } from "./HandoffControls";
import { SessionDetailPanel } from "./SessionDetailPanel";
import { Badge } from "./ui";

type RoomSessionsPanelProps = {
  sessions: Session[];
  agents: Agent[];
  runtimes: Runtime[];
  workItems: WorkItem[];
  selectedSessionId?: string;
  sessionDetails?: Record<string, SessionDetailResponse>;
};

export function RoomSessionsPanel({
  sessions,
  agents,
  runtimes,
  workItems,
  selectedSessionId,
  sessionDetails
}: RoomSessionsPanelProps) {
  if (sessions.length === 0) {
    return <EmptyState title="No sessions yet" body="Sessions attached to this room will appear here." />;
  }

  const selectedSession = pickSelectedSession(sessions, selectedSessionId);
  const selectedDetail = selectedSession ? sessionDetails?.[selectedSession.id] : undefined;

  return (
    <section className="room-sessions-panel" aria-label="Room sessions">
      <div className="room-sessions-list" role="list">
        {sessions.map((session) => {
          const workItem = workItems.find((item) => item.id === session.workItemId);
          const agent = agents.find((item) => item.id === session.agentId);
          const runtime = runtimes.find((item) => item.id === session.runtimeId);
          const isSelected = session.id === selectedSession?.id;
          return (
            <article className={`room-session-row ${isSelected ? "is-selected" : ""}`} key={session.id} role="listitem">
              <div className="room-session-row-main">
                <strong>{workItem?.title ?? session.id.toUpperCase()}</strong>
                <span>{session.id.toUpperCase()}</span>
              </div>
              <div className="room-session-row-meta">
                {agent?.name ? <span>Agent: {agent.name}</span> : null}
                {runtime?.name ? <span>Runtime: {runtime.name}</span> : null}
              </div>
              <Badge className="room-session-status-badge" tone={statusTone(session.status)}>
                {session.status.replaceAll("_", " ")}
              </Badge>
            </article>
          );
        })}
      </div>

      <section className="room-session-detail-slot">
        {selectedDetail ? (
          <SessionDetailPanel detail={selectedDetail} className="room-session-detail-panel" />
        ) : selectedSession ? (
          <section className="room-session-inline-handoff">
            <header>
              <h3>{selectedSession.id.toUpperCase()}</h3>
              <span>{selectedSession.status.replaceAll("_", " ")}</span>
            </header>
            <HandoffControls sessionId={selectedSession.id} />
          </section>
        ) : null}
      </section>
    </section>
  );
}

function pickSelectedSession(sessions: Session[], selectedSessionId?: string) {
  if (selectedSessionId) {
    const selected = sessions.find((session) => session.id === selectedSessionId);
    if (selected) {
      return selected;
    }
  }
  return sessions.find((session) => session.status === "needs_human") ?? sessions[0];
}

function statusTone(status: Session["status"]) {
  if (status === "running") {
    return "blue";
  }
  if (status === "needs_human") {
    return "yellow";
  }
  if (status === "completed") {
    return "green";
  }
  if (status === "failed") {
    return "red";
  }
  return "neutral";
}
