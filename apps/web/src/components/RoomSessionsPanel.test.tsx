import React from "react";
import { Agent, Runtime, Session, SessionDetailResponse, WorkItem } from "@automomo/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoomSessionsPanel } from "./RoomSessionsPanel";

const now = "2026-04-21T08:00:00.000Z";

describe("RoomSessionsPanel", () => {
  it("renders room sessions with badges for queued, running, needs_human, completed, and failed", () => {
    const html = renderToStaticMarkup(
      <RoomSessionsPanel
        sessions={[
          createSession({ id: "session_queued", status: "queued" }),
          createSession({ id: "session_running", status: "running" }),
          createSession({ id: "session_human", status: "needs_human" }),
          createSession({ id: "session_completed", status: "completed" }),
          createSession({ id: "session_failed", status: "failed" })
        ]}
        agents={[createAgent({ id: "agent_1", name: "Ralph" })]}
        runtimes={[createRuntime({ id: "runtime_1", name: "Pi Runtime" })]}
        workItems={[
          createWorkItem({ id: "work_1", title: "Queued item" }),
          createWorkItem({ id: "work_2", title: "Running item" }),
          createWorkItem({ id: "work_3", title: "Needs human item" }),
          createWorkItem({ id: "work_4", title: "Completed item" }),
          createWorkItem({ id: "work_5", title: "Failed item" })
        ]}
      />
    );

    expect(html).toContain("queued");
    expect(html).toContain("running");
    expect(html).toContain("needs human");
    expect(html).toContain("completed");
    expect(html).toContain("failed");
  });

  it("shows agent and runtime names when available", () => {
    const html = renderToStaticMarkup(
      <RoomSessionsPanel
        sessions={[
          createSession({
            id: "session_named",
            status: "running",
            agentId: "agent_1",
            runtimeId: "runtime_1",
            workItemId: "work_1"
          })
        ]}
        agents={[createAgent({ id: "agent_1", name: "Ralph" })]}
        runtimes={[createRuntime({ id: "runtime_1", name: "Pi Runtime" })]}
        workItems={[createWorkItem({ id: "work_1", title: "Investigate room flow" })]}
      />
    );

    expect(html).toContain("Ralph");
    expect(html).toContain("Pi Runtime");
  });

  it("includes handoff controls for selected or first needs-human session and reuses detail panel when detail exists", () => {
    const sessionRunning = createSession({ id: "session_running", status: "running", workItemId: "work_1" });
    const sessionNeedsHuman = createSession({ id: "session_human", status: "needs_human", workItemId: "work_2" });
    const detail = createSessionDetail(sessionRunning);

    const selectedHtml = renderToStaticMarkup(
      <RoomSessionsPanel
        sessions={[sessionRunning, sessionNeedsHuman]}
        agents={[]}
        runtimes={[]}
        workItems={[createWorkItem({ id: "work_1", title: "Running task" }), createWorkItem({ id: "work_2", title: "Needs human task" })]}
        selectedSessionId="session_running"
        sessionDetails={{ session_running: detail }}
      />
    );
    expect(selectedHtml).toContain('data-json-endpoint="/api/sessions/session_running/handoff"');
    expect(selectedHtml).toContain("Session timeline");

    const defaultHtml = renderToStaticMarkup(
      <RoomSessionsPanel
        sessions={[sessionRunning, sessionNeedsHuman]}
        agents={[]}
        runtimes={[]}
        workItems={[createWorkItem({ id: "work_1", title: "Running task" }), createWorkItem({ id: "work_2", title: "Needs human task" })]}
      />
    );
    expect(defaultHtml).toContain('data-json-endpoint="/api/sessions/session_human/handoff"');
  });
});

function createSession(overrides: Partial<Session>): Session {
  return {
    id: overrides.id ?? "session_1",
    codebaseId: overrides.codebaseId ?? "codebase_1",
    roomId: overrides.roomId ?? "room_1",
    workItemId: overrides.workItemId ?? "work_1",
    agentId: overrides.agentId,
    runtimeId: overrides.runtimeId,
    status: overrides.status ?? "queued",
    participants: overrides.participants ?? [],
    leaseId: overrides.leaseId,
    outcomeId: overrides.outcomeId,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? now,
    startedAt: overrides.startedAt,
    completedAt: overrides.completedAt,
    updatedAt: overrides.updatedAt ?? now
  };
}

function createAgent(overrides: Partial<Agent>): Agent {
  return {
    id: overrides.id ?? "agent_1",
    name: overrides.name ?? "Agent",
    instructions: overrides.instructions ?? "",
    skills: overrides.skills ?? [],
    tools: overrides.tools ?? [],
    maxConcurrency: overrides.maxConcurrency ?? 1,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    model: overrides.model,
    defaultRuntimeId: overrides.defaultRuntimeId
  };
}

function createRuntime(overrides: Partial<Runtime>): Runtime {
  return {
    id: overrides.id ?? "runtime_1",
    name: overrides.name ?? "Runtime",
    mode: overrides.mode ?? "local",
    provider: overrides.provider ?? "pi",
    environment: overrides.environment ?? { networkPolicy: "restricted", env: {}, secretRefs: [] },
    status: overrides.status ?? "online",
    capacity: overrides.capacity ?? 1,
    activeSessions: overrides.activeSessions ?? 0,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    lastHeartbeatAt: overrides.lastHeartbeatAt
  };
}

function createWorkItem(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: overrides.id ?? "work_1",
    codebaseId: overrides.codebaseId ?? "codebase_1",
    roomId: overrides.roomId ?? "room_1",
    title: overrides.title ?? "Work item",
    body: overrides.body ?? "",
    source: overrides.source ?? "manual",
    status: overrides.status ?? "open",
    priority: overrides.priority ?? "medium",
    labels: overrides.labels ?? [],
    connector: overrides.connector,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  };
}

function createSessionDetail(session: Session): SessionDetailResponse {
  return {
    session,
    events: [{ id: "event_1", sessionId: session.id, sequence: 0, kind: "text", summary: "Agent updated", detail: "Working on patch", metadata: {}, createdAt: now }],
    handoffs: [{ id: "handoff_1", sessionId: session.id, status: "requested", reason: "Need human review", note: "", createdAt: now, updatedAt: now }],
    outcome: undefined,
    workItem: createWorkItem({ id: session.workItemId ?? "work_1", title: "Work item" }),
    agent: undefined,
    runtime: undefined,
    room: undefined
  };
}
