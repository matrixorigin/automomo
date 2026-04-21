import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api", () => ({
  getApiClient: () => ({
    getOverview: async () => ({
      counts: { codebases: 1, workItems: 1, sessions: 1, agents: 1, runtimes: 1 },
      runtimeHealth: { idle: 0, online: 1, offline: 0, busy: 0, unhealthy: 0 },
      handoffCount: 0,
      daemonCount: 1,
      activeSessionCount: 1,
      recentEvents: []
    }),
    listSessions: async () => ({
      items: [
        {
          id: "session_1",
          codebaseId: "codebase_1",
          roomId: "room_1",
          workItemId: "work_1",
          agentId: "agent_1",
          runtimeId: "runtime_1",
          status: "running",
          participants: [
            { type: "human", name: "Operator" },
            { type: "agent", id: "agent_1", name: "Ralph" }
          ],
          metadata: {},
          createdAt: "2026-04-20T08:00:00.000Z",
          startedAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z"
        }
      ],
      page: { limit: 50, offset: 0, total: 1 }
    }),
    listWorkItems: async () => ({
      items: [
        {
          id: "work_1",
          codebaseId: "codebase_1",
          roomId: "room_1",
          title: "Session work",
          body: "Run checks",
          source: "manual",
          status: "ready",
          priority: "medium",
          labels: [],
          metadata: {},
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z"
        }
      ],
      page: { limit: 50, offset: 0, total: 1 }
    }),
    listAgents: async () => [{ id: "agent_1", name: "Ralph", metadata: {} }],
    listRuntimes: async () => [
      {
        id: "runtime_1",
        name: "Pi Runtime",
        mode: "local",
        provider: "pi",
        environment: { networkPolicy: "restricted", env: {}, secretRefs: [] },
        status: "online",
        capacity: 2,
        activeSessions: 1,
        metadata: {},
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z"
      }
    ],
    listRooms: async () => ({
      items: [
        {
          id: "room_1",
          codebaseId: "codebase_1",
          name: "Runtime room",
          description: "",
          status: "active",
          metadata: {},
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z"
        }
      ],
      page: { limit: 50, offset: 0, total: 1 }
    }),
    getSession: async () => ({
      session: {
        id: "session_1",
        codebaseId: "codebase_1",
        roomId: "room_1",
        workItemId: "work_1",
        agentId: "agent_1",
        runtimeId: "runtime_1",
        status: "running",
        participants: [
          { type: "human", name: "Operator" },
          { type: "agent", id: "agent_1", name: "Ralph" }
        ],
        metadata: {},
        createdAt: "2026-04-20T08:00:00.000Z",
        startedAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z"
      },
      events: [],
      handoffs: [],
      runtime: undefined,
      agent: undefined,
      workItem: undefined,
      outcome: undefined
    })
  })
}));

describe("Sessions page", () => {
  it("renders session history with room, agent, runtime, and status context", async () => {
    const { default: SessionsPage } = await import("./page");
    const html = renderToStaticMarkup(await SessionsPage());

    expect(html).toContain("Session history");
    expect(html).toContain("Operations history");
    expect(html).toContain("Runtime room");
    expect(html).toContain("Ralph");
    expect(html).toContain("Pi Runtime");
    expect(html).toContain("running");
    expect(html).toContain('href="/rooms/room_1"');
  });
});
