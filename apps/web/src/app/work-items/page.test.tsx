import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api", () => ({
  getApiClient: () => ({
    getOverview: async () => ({
      counts: { codebases: 1, workItems: 2, sessions: 0, agents: 0, runtimes: 0 },
      runtimeHealth: { idle: 0, online: 0, offline: 0, busy: 0, unhealthy: 0 },
      handoffCount: 0,
      daemonCount: 0,
      activeSessionCount: 0,
      recentEvents: []
    }),
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
    listWorkItems: async () => ({
      items: [
        {
          id: "work_1",
          codebaseId: "codebase_1",
          roomId: "room_1",
          title: "Room work",
          body: "Grouped under runtime room.",
          source: "manual",
          status: "ready",
          priority: "medium",
          labels: [],
          metadata: {},
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z"
        },
        {
          id: "work_2",
          codebaseId: "codebase_1",
          title: "Global work",
          body: "No room yet.",
          source: "manual",
          status: "open",
          priority: "low",
          labels: [],
          metadata: {},
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z"
        }
      ],
      page: { limit: 50, offset: 0, total: 2 }
    })
  })
}));

describe("Work Items page", () => {
  it("groups global work by room", async () => {
    const { default: WorkItemsPage } = await import("./page");
    const html = renderToStaticMarkup(await WorkItemsPage());

    expect(html).toContain("Runtime room");
    expect(html).toContain("Unassigned");
    expect(html).toContain("Room work");
    expect(html).toContain("Global work");
  });
});
