import { describe, expect, it } from "vitest";
import { createAutomomoApiClient } from "./api";

const now = "2026-04-20T08:00:00.000Z";

describe("automomo web API client", () => {
  it("validates overview and serializes list filters", async () => {
    const requests: string[] = [];
    const client = createAutomomoApiClient({
      baseUrl: "http://automomo.test/",
      fetchImpl: async (input) => {
        requests.push(String(input));
        if (String(input).includes("/api/overview")) {
          return Response.json({
            counts: { codebases: 1, workItems: 0, sessions: 0, agents: 0, runtimes: 0 },
            runtimeHealth: { idle: 0, online: 0, offline: 0, busy: 0, unhealthy: 0 },
            handoffCount: 0,
            daemonCount: 0,
            activeSessionCount: 0,
            recentEvents: []
          });
        }
        return Response.json({
          items: [],
          page: { limit: 25, offset: 0, total: 0 }
        });
      }
    });

    const overview = await client.getOverview();
    const workItems = await client.listWorkItems({ status: "ready", limit: 25, q: "runtime", codebaseId: undefined });

    expect(overview.counts.codebases).toBe(1);
    expect(workItems.page.limit).toBe(25);
    expect(requests).toEqual([
      "http://automomo.test/api/overview",
      "http://automomo.test/api/work-items?status=ready&q=runtime&limit=25"
    ]);
  });

  it("validates primary collection responses", async () => {
    const client = createAutomomoApiClient({
      baseUrl: "http://automomo.test",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/api/codebases")) {
          return Response.json({
            codebases: [{ id: "codebase_1", name: "automomo", provider: "git", metadata: {}, createdAt: now, updatedAt: now }]
          });
        }
        if (url.endsWith("/api/orchestration-rules")) {
          return Response.json({ orchestrationRules: [] });
        }
        if (url.endsWith("/api/rooms")) {
          return Response.json({ rooms: [], items: [], page: { limit: 50, offset: 0, total: 0 } });
        }
        if (url.endsWith("/api/rooms/room_1/agents")) {
          return Response.json({ roomAgents: [] });
        }
        if (url.endsWith("/api/rooms/room_1/messages")) {
          return Response.json({ roomMessages: [] });
        }
        if (url.endsWith("/api/rooms/room_1/tasks")) {
          return Response.json({ roomTasks: [] });
        }
        if (url.endsWith("/api/rooms/room_1/work-items")) {
          return Response.json({ workItems: [], items: [], page: { limit: 50, offset: 0, total: 0 } });
        }
        if (url.endsWith("/api/agents")) {
          return Response.json({ agents: [] });
        }
        if (url.endsWith("/api/runtimes")) {
          return Response.json({ runtimes: [] });
        }
        return Response.json({ items: [], page: { limit: 50, offset: 0, total: 0 } });
      }
    });

    await expect(client.listCodebases()).resolves.toHaveLength(1);
    await expect(client.listOrchestrationRules()).resolves.toEqual([]);
    await expect(client.listRooms()).resolves.toMatchObject({ items: [], page: { total: 0 } });
    await expect(client.listRoomAgents("room_1")).resolves.toEqual([]);
    await expect(client.listRoomMessages("room_1")).resolves.toEqual([]);
    await expect(client.listRoomTasks("room_1")).resolves.toEqual([]);
    await expect(client.listRoomWorkItems("room_1")).resolves.toMatchObject({ items: [], page: { total: 0 } });
    await expect(client.listAgents()).resolves.toEqual([]);
    await expect(client.listRuntimes()).resolves.toEqual([]);
    await expect(client.listSessions({ status: "queued" })).resolves.toMatchObject({ page: { total: 0 } });
  });

  it("sends write payloads as JSON to the API", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const client = createAutomomoApiClient({
      baseUrl: "http://automomo.test",
      fetchImpl: async (input, init) => {
        requests.push({ url: String(input), init });
        if (String(input).endsWith("/api/agents")) {
          return Response.json({
            agent: {
              id: "agent_1",
              name: "Ralph",
              instructions: "",
              skills: [],
              tools: [],
              maxConcurrency: 1,
              metadata: {},
              createdAt: now,
              updatedAt: now
            }
          });
        }
        if (String(input).endsWith("/api/rooms")) {
          return Response.json({
            room: {
              id: "room_1",
              codebaseId: "codebase_1",
              name: "Shared room",
              status: "active",
              metadata: {},
              createdAt: now,
              updatedAt: now
            }
          });
        }
        if (String(input).endsWith("/api/rooms/room_1/work-items")) {
          return Response.json({
            workItem: {
              id: "work_1",
              codebaseId: "codebase_1",
              roomId: "room_1",
              title: "Room work",
              body: "",
              source: "manual",
              status: "open",
              priority: "medium",
              labels: [],
              metadata: {},
              createdAt: now,
              updatedAt: now
            }
          });
        }
        return Response.json({});
      }
    });

    await client.createAgent({ name: "Ralph" });
    await client.createRoom({ codebaseId: "codebase_1", name: "Shared room" });
    await client.createRoomWorkItem("room_1", { title: "Room work" });

    expect(requests).toEqual([
      {
        url: "http://automomo.test/api/agents",
        init: expect.objectContaining({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Ralph" })
        })
      },
      {
        url: "http://automomo.test/api/rooms",
        init: expect.objectContaining({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ codebaseId: "codebase_1", name: "Shared room" })
        })
      },
      {
        url: "http://automomo.test/api/rooms/room_1/work-items",
        init: expect.objectContaining({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: "Room work" })
        })
      }
    ]);
  });
});
