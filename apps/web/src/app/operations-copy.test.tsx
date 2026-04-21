import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", () => ({
  getApiClient: () => ({
    getOverview: async () => ({
      counts: { codebases: 1, workItems: 0, sessions: 0, agents: 1, runtimes: 1 },
      runtimeHealth: { idle: 0, online: 1, offline: 0, busy: 0, unhealthy: 0 },
      handoffCount: 0,
      daemonCount: 1,
      activeSessionCount: 0,
      recentEvents: []
    }),
    listCodebases: async () => [{ id: "codebase_1", name: "automomo", workspaceRoot: "/repo", status: "active", createdAt: "2026-04-20T08:00:00.000Z", updatedAt: "2026-04-20T08:00:00.000Z", metadata: {} }],
    listAgents: async () => [{ id: "agent_1", name: "Ralph", instructions: "help", model: "gpt-5", skills: [], tools: [], metadata: {}, createdAt: "2026-04-20T08:00:00.000Z", updatedAt: "2026-04-20T08:00:00.000Z" }],
    listOrchestrationRules: async () => [],
    listRuntimes: async () => [
      {
        id: "runtime_1",
        name: "Pi Runtime",
        mode: "local",
        provider: "pi",
        environment: { networkPolicy: "restricted", env: {}, secretRefs: [] },
        status: "online",
        capacity: 1,
        activeSessions: 0,
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
    })
  })
}));

describe("Global operations copy", () => {
  it("uses room-first language on orchestration, runtimes, and settings pages", async () => {
    const { default: OrchestrationPage } = await import("./orchestration/page");
    const { default: RuntimesPage } = await import("./runtimes/page");
    const { default: SettingsPage } = await import("./settings/page");

    const orchestrationHtml = renderToStaticMarkup(await OrchestrationPage());
    const runtimesHtml = renderToStaticMarkup(await RuntimesPage());
    const settingsHtml = renderToStaticMarkup(await SettingsPage());

    expect(orchestrationHtml).toContain("Rules automate room work");
    expect(orchestrationHtml).toContain("No room rules");
    expect(orchestrationHtml).toContain("route room work");

    expect(runtimesHtml).toContain("Reusable code environments");
    expect(runtimesHtml).toContain("Runtime inventory");

    expect(settingsHtml).toContain("Setup and configuration");
    expect(settingsHtml).toContain("API base URL");
  });
});
