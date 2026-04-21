import React from "react";
import { Agent, Runtime, Session } from "@automomo/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getRoomRuntimeCandidates, RoomRuntimePanel } from "./RoomRuntimePanel";
import { RuntimePresenceBadge } from "./RuntimePresenceBadge";

const now = "2026-04-21T08:00:00.000Z";

describe("RoomRuntimePanel", () => {
  it("prioritizes runtime ids from room sessions, then agent defaults, then workspace root matches", () => {
    const runtimes = [
      createRuntime({ id: "runtime_session", mode: "local", provider: "docker" }),
      createRuntime({ id: "runtime_agent", mode: "remote_daemon", provider: "pi" }),
      createRuntime({
        id: "runtime_workspace",
        mode: "hosted",
        provider: "codex",
        environment: { workspaceRoot: "/src/automomo", networkPolicy: "restricted", env: {}, secretRefs: [] }
      })
    ];

    const candidates = getRoomRuntimeCandidates({
      runtimes,
      sessions: [createSession({ runtimeId: "runtime_session" })],
      joinedAgents: [createAgent({ defaultRuntimeId: "runtime_agent" })],
      codebaseWorkspaceRoot: "/src/automomo"
    });

    expect(candidates.map((candidate) => candidate.runtime.id)).toEqual(["runtime_session", "runtime_agent", "runtime_workspace"]);
    expect(candidates.map((candidate) => candidate.source)).toEqual(["session", "agent_default", "workspace_root"]);
  });

  it("falls back to an empty candidate list when no runtime association is available", () => {
    const candidates = getRoomRuntimeCandidates({
      runtimes: [createRuntime({ id: "runtime_1" })],
      sessions: [createSession({ runtimeId: undefined })],
      joinedAgents: [createAgent({ defaultRuntimeId: undefined })],
      codebaseWorkspaceRoot: undefined
    });

    expect(candidates).toEqual([]);
  });

  it("renders runtime mode/provider labels, status tones, workspace root, active sessions, and heartbeat", () => {
    const html = renderToStaticMarkup(
      <RoomRuntimePanel
        runtimes={[
          createRuntime({
            id: "runtime_1",
            name: "Local runtime",
            mode: "local",
            provider: "docker",
            status: "online",
            activeSessions: 3,
            lastHeartbeatAt: "2026-04-21T08:10:00.000Z",
            environment: { workspaceRoot: "/src/automomo", networkPolicy: "restricted", env: {}, secretRefs: [] }
          }),
          createRuntime({
            id: "runtime_2",
            name: "Remote daemon runtime",
            mode: "remote_daemon",
            provider: "pi",
            status: "busy",
            activeSessions: 1
          }),
          createRuntime({
            id: "runtime_3",
            name: "Hosted runtime",
            mode: "hosted",
            provider: "codex",
            status: "unhealthy",
            activeSessions: 0
          })
        ]}
        sessions={[
          createSession({ runtimeId: "runtime_1", status: "running" }),
          createSession({ runtimeId: "runtime_2", status: "queued" })
        ]}
        joinedAgents={[createAgent({ defaultRuntimeId: "runtime_3" })]}
        codebaseWorkspaceRoot="/src/automomo"
      />
    );

    expect(html).toContain("Local");
    expect(html).toContain("Remote daemon");
    expect(html).toContain("Hosted");
    expect(html).toContain("Docker");
    expect(html).toContain("Pi");
    expect(html).toContain("Codex");
    expect(html).toContain("online");
    expect(html).toContain("busy");
    expect(html).toContain("unhealthy");
    expect(html).toContain("/src/automomo");
    expect(html).toContain("3 active sessions");
    expect(html).toContain("Heartbeat");
  });

  it("renders an empty state when no runtime candidate exists", () => {
    const html = renderToStaticMarkup(
      <RoomRuntimePanel
        runtimes={[]}
        sessions={[createSession({ runtimeId: undefined })]}
        joinedAgents={[createAgent({ defaultRuntimeId: undefined })]}
      />
    );
    expect(html).toContain("No runtime attached");
  });
});

describe("RuntimePresenceBadge", () => {
  it("renders compact runtime presence for the highest-priority runtime candidate", () => {
    const html = renderToStaticMarkup(
      <RuntimePresenceBadge
        runtime={createRuntime({ id: "runtime_1", mode: "remote_daemon", provider: "pi", status: "busy", activeSessions: 2 })}
      />
    );

    expect(html).toContain("Remote daemon");
    expect(html).toContain("Pi");
    expect(html).toContain("busy");
    expect(html).toContain("2 sessions");
  });

  it("renders a no-runtime fallback", () => {
    const html = renderToStaticMarkup(<RuntimePresenceBadge runtime={undefined} />);
    expect(html).toContain("No runtime");
  });
});

function createSession(overrides: Partial<Session>): Session {
  return {
    id: overrides.id ?? "session_1",
    codebaseId: overrides.codebaseId ?? "codebase_1",
    roomId: overrides.roomId ?? "room_1",
    workItemId: overrides.workItemId,
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
    status: overrides.status ?? "offline",
    capacity: overrides.capacity ?? 1,
    activeSessions: overrides.activeSessions ?? 0,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    lastHeartbeatAt: overrides.lastHeartbeatAt
  };
}
