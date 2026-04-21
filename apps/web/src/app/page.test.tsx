import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", () => ({
  getApiClient: () => ({
    getOverview: async () => ({
      counts: { codebases: 1, workItems: 2, sessions: 2, agents: 1, runtimes: 2 },
      runtimeHealth: { idle: 0, online: 1, offline: 0, busy: 1, unhealthy: 0 },
      handoffCount: 1,
      daemonCount: 1,
      activeSessionCount: 2,
      recentEvents: [
        {
          id: "event_1",
          sessionId: "session_1",
          sequence: 1,
          kind: "handoff",
          summary: "Needs review",
          detail: "Waiting for operator approval.",
          actor: { type: "agent", id: "agent_1", name: "Ralph" },
          metadata: {},
          createdAt: "2026-04-20T08:05:00.000Z"
        }
      ]
    }),
    listRooms: async () => ({
      items: [
        {
          id: "room_1",
          codebaseId: "codebase_1",
          name: "Runtime room",
          description: "Shared runtime work.",
          status: "active",
          metadata: {},
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z"
        }
      ],
      page: { limit: 50, offset: 0, total: 1 }
    }),
    listAgents: async () => [{ id: "agent_1", name: "Ralph", metadata: {} }],
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
          participants: [{ type: "agent", id: "agent_1", name: "Ralph" }],
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
          title: "Room handoff",
          body: "Approve final release.",
          source: "manual",
          status: "needs_human",
          priority: "high",
          labels: [],
          metadata: {},
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z"
        }
      ],
      page: { limit: 50, offset: 0, total: 1 }
    }),
    listRoomMessages: async () => [
      {
        id: "msg_1",
        roomId: "room_1",
        author: { type: "human", name: "Operator" },
        body: "Please verify runtime health.",
        metadata: {},
        createdAt: "2026-04-20T08:03:00.000Z",
        updatedAt: "2026-04-20T08:03:00.000Z"
      }
    ]
  })
}));

describe("Home page", () => {
  it("renders room-first home sections", async () => {
    const { default: HomePage } = await import("./page");
    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("Rooms home");
    expect(html).toContain("Active rooms");
    expect(html).toContain("Recent room messages");
    expect(html).toContain("Active sessions");
    expect(html).toContain("Handoffs needing attention");
    expect(html).toContain("Runtime health");
    expect(html).toContain("Recent events");
    expect(html).toContain("Runtime room");
    expect(html).toContain("Please verify runtime health.");
    expect(html).toContain('href="/rooms/room_1"');
  });
});
