import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api", () => ({
  getApiClient: () => ({
    getOverview: async () => ({
      counts: { codebases: 1, workItems: 1, sessions: 0, agents: 1, runtimes: 1 },
      runtimeHealth: { idle: 0, online: 1, offline: 0, busy: 0, unhealthy: 0 },
      handoffCount: 0,
      daemonCount: 0,
      activeSessionCount: 0,
      recentEvents: []
    }),
    listCodebases: async () => [{ id: "codebase_1", name: "automomo" }],
    listAgents: async () => [
      { id: "agent_1", name: "Ralph" },
      { id: "agent_2", name: "Nova" }
    ],
    listRooms: async () => ({
      items: [
        {
          id: "room_1",
          codebaseId: "codebase_1",
          name: "Shared room",
          description: "Working room",
          status: "active",
          metadata: {},
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z"
        }
      ],
      page: { limit: 50, offset: 0, total: 1 }
    }),
    listRoomAgents: async () => [
      { id: "room_agent_1", roomId: "room_1", agentId: "agent_1", metadata: {}, createdAt: "2026-04-20T08:00:00.000Z", updatedAt: "2026-04-20T08:00:00.000Z" },
      { id: "room_agent_2", roomId: "room_1", agentId: "agent_2", metadata: {}, createdAt: "2026-04-20T08:00:00.000Z", updatedAt: "2026-04-20T08:00:00.000Z" }
    ],
    listRoomMessages: async () => [
      {
        id: "message_1",
        roomId: "room_1",
        author: { type: "agent", agentId: "agent_1", name: "Ralph" },
        body: "I am drafting the patch.",
        metadata: {},
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z"
      }
    ],
    listRoomTasks: async () => [
      {
        id: "task_1",
        roomId: "room_1",
        title: "Draft patch",
        body: "Break the work into two passes.",
        status: "open",
        assignedAgentId: "agent_1",
        workItemId: "work_1",
        metadata: {},
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z"
      }
    ],
    listRoomWorkItems: async () => ({
      items: [
        {
          id: "work_1",
          codebaseId: "codebase_1",
          roomId: "room_1",
          title: "Investigate room flow",
          body: "Use work items as room board cards.",
          source: "manual",
          status: "ready",
          priority: "medium",
          labels: ["room"],
          metadata: {},
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z"
        }
      ],
      page: { limit: 50, offset: 0, total: 1 }
    }),
    listWorkItems: async () => ({
      items: [{ id: "work_1", codebaseId: "codebase_1", title: "Investigate room flow", body: "", source: "manual", status: "ready", priority: "medium", labels: [], metadata: {}, createdAt: "2026-04-20T08:00:00.000Z", updatedAt: "2026-04-20T08:00:00.000Z" }],
      page: { limit: 50, offset: 0, total: 1 }
    }),
    listRuntimes: async () => [{ id: "runtime_1", name: "Local Pi runtime" }]
  })
}));

describe("Rooms page", () => {
  it("renders rooms, membership counts, recent messages, and compact create controls", async () => {
    const { default: RoomsPage } = await import("./page");
    const html = renderToStaticMarkup(await RoomsPage());

    expect(html).toContain("Rooms");
    expect(html).toContain("Shared room");
    expect(html).toContain("2 agents");
    expect(html).toContain("Room work");
    expect(html).toContain("Investigate room flow");
    expect(html).toContain("ready");
    expect(html).toContain("1 work item");
    expect(html).toContain("I am drafting the patch.");
    expect(html).toContain("Draft patch");
    expect(html).toContain('data-json-endpoint="/api/rooms"');
  });
});
