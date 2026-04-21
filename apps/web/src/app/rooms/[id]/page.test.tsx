import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RoomDetailPage from "./page";

vi.mock("../../../lib/api", () => ({
  getApiClient: () => ({
    getOverview: async () => ({
      counts: { codebases: 1, workItems: 1, sessions: 0, agents: 2, runtimes: 1 },
      runtimeHealth: { idle: 0, online: 1, offline: 0, busy: 0, unhealthy: 0 },
      handoffCount: 0,
      daemonCount: 0,
      activeSessionCount: 0,
      recentEvents: []
    }),
    listCodebases: async () => [{ id: "codebase_1", name: "automomo" }],
    listAgents: async () => [
      { id: "agent_1", name: "Ralph" },
      { id: "agent_2", name: "Nova" },
      { id: "agent_3", name: "Kai" }
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
        author: { type: "human", name: "Operator" },
        body: "@Ralph please inspect the runtime branch.",
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
    listSessions: async (query: { roomId?: string }) => ({
      items: [
        {
          id: "session_1",
          codebaseId: "codebase_1",
          roomId: query.roomId ?? "room_1",
          workItemId: "work_1",
          agentId: "agent_1",
          runtimeId: "runtime_1",
          status: "running",
          participants: [
            { type: "human", name: "Operator" },
            { type: "agent", name: "Ralph", id: "agent_1" }
          ],
          metadata: {},
          createdAt: "2026-04-20T08:00:00.000Z",
          startedAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z"
        }
      ],
      page: { limit: 50, offset: 0, total: 1 }
    }),
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
    ]
  })
}));

describe("Room detail page", () => {
  it("renders a room workspace header and tabs with room chat stream controls", async () => {
    const html = renderToStaticMarkup(await RoomDetailPage({ params: Promise.resolve({ id: "room_1" }) }));

    expect(html).toContain("Shared room");
    expect(html).toContain("2 agents joined");
    expect(html).toContain("Runtime presence");
    expect(html).toContain("Chat");
    expect(html).toContain("Board");
    expect(html).toContain("Sessions");
    expect(html).toContain("Outcomes");
    expect(html).toContain("Human Operator");
    expect(html).toContain("mention-token");
    expect(html).toContain("@Ralph");
    expect(html).toContain("Send message");
    expect(html).toContain("Add agent");
    expect(html).toContain("Nova");
    expect(html).toContain("Kai");
    expect(html).toContain("Create room work item");
    expect(html).toContain("Investigate room flow");
    expect(html).not.toContain("Room action");
  });
});
