import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/store";

const now = "2026-04-20T08:00:00.000Z";
const later = "2026-04-20T08:02:00.000Z";

function json(body: unknown) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

describe("list filters and overview", () => {
  it("filters work items, ignores unknown query params, and returns pagination metadata", async () => {
    const app = createApp({ store: new MemoryStore(), now: () => new Date(now) });
    await app.request("/api/codebases", json({ id: "codebase_1", name: "automomo", provider: "git" }));
    await app.request("/api/rooms", json({ id: "room_1", codebaseId: "codebase_1", name: "Runtime room" }));
    await app.request("/api/rooms", json({ id: "room_2", codebaseId: "codebase_1", name: "UI room" }));
    await app.request(
      "/api/work-items",
      json({
        id: "work_b",
        codebaseId: "codebase_1",
        roomId: "room_1",
        title: "Runtime lease handling",
        source: "api",
        status: "ready",
        priority: "high",
        labels: ["runtime"],
        metadata: { assignee: "ralph" },
        createdAt: now,
        updatedAt: later
      })
    );
    await app.request(
      "/api/work-items",
      json({
        id: "work_a",
        codebaseId: "codebase_1",
        roomId: "room_2",
        title: "UI empty state",
        source: "manual",
        status: "open",
        labels: ["ui"],
        metadata: { assignee: "nova" },
        createdAt: now,
        updatedAt: now
      })
    );

    const filtered = await app.request(
      "/api/work-items?codebaseId=codebase_1&source=api&status=ready&assignee=ralph&q=lease&ignored=true&limit=5&offset=0"
    );
    expect(filtered.status).toBe(200);
    const payload = (await filtered.json()) as { items: Array<{ id: string }>; page: { total: number } };
    expect(payload.items.map((item) => item.id)).toEqual(["work_b"]);
    expect(payload.page).toMatchObject({ total: 1, limit: 5, offset: 0 });

    const paged = await app.request("/api/work-items?limit=1&offset=0");
    const pagedPayload = (await paged.json()) as { items: Array<{ id: string }> };
    expect(pagedPayload.items.map((item) => item.id)).toEqual(["work_a"]);

    const roomFiltered = await app.request("/api/work-items?roomId=room_2");
    const roomPayload = (await roomFiltered.json()) as { items: Array<{ id: string; roomId?: string }> };
    expect(roomPayload.items).toEqual([expect.objectContaining({ id: "work_a", roomId: "room_2" })]);
  });

  it("filters sessions by runtime, participant, date range, and stable pagination", async () => {
    const app = createApp({ store: new MemoryStore(), now: () => new Date(now) });
    await app.request(
      "/api/sessions",
      json({
        id: "session_b",
        codebaseId: "codebase_1",
        agentId: "agent_1",
        runtimeId: "runtime_1",
        status: "running",
        participants: [{ type: "agent", id: "agent_1", name: "Ralph" }],
        createdAt: now,
        updatedAt: later
      })
    );
    await app.request(
      "/api/sessions",
      json({
        id: "session_a",
        codebaseId: "codebase_1",
        agentId: "agent_2",
        runtimeId: "runtime_2",
        status: "queued",
        participants: [{ type: "agent", id: "agent_2", name: "Nova" }],
        createdAt: now,
        updatedAt: now
      })
    );

    const filtered = await app.request(
      "/api/sessions?status=running&codebaseId=codebase_1&agentId=agent_1&runtimeId=runtime_1&participant=Ralph&createdAfter=2026-04-20T07:00:00.000Z&createdBefore=2026-04-20T09:00:00.000Z"
    );
    const payload = (await filtered.json()) as { items: Array<{ id: string }>; page: { total: number } };
    expect(payload.items.map((session) => session.id)).toEqual(["session_b"]);
    expect(payload.page.total).toBe(1);

    const paged = await app.request("/api/sessions?limit=1&offset=0");
    const pagedPayload = (await paged.json()) as { items: Array<{ id: string }> };
    expect(pagedPayload.items.map((session) => session.id)).toEqual(["session_a"]);
  });

  it("summarizes persisted control-plane state for the overview", async () => {
    const app = createApp({ store: new MemoryStore(), now: () => new Date(now) });
    await app.request("/api/codebases", json({ id: "codebase_1", name: "automomo", provider: "git" }));
    await app.request("/api/work-items", json({ id: "work_1", codebaseId: "codebase_1", title: "Summarize state" }));
    await app.request(
      "/api/runtimes",
      json({ id: "runtime_1", name: "Local Pi", mode: "local", provider: "pi", status: "online", activeSessions: 1 })
    );
    await app.request("/api/agents", json({ id: "agent_1", name: "Ralph" }));
    await app.request(
      "/api/sessions",
      json({ id: "session_1", codebaseId: "codebase_1", workItemId: "work_1", agentId: "agent_1", runtimeId: "runtime_1", status: "running" })
    );
    await app.request("/api/sessions/session_1/handoff", json({ reason: "Need human input" }));
    await app.request(
      "/api/sessions/session_1/events",
      json({
        events: [
          {
            id: "event_1",
            sessionId: "session_1",
            sequence: 0,
            kind: "runtime",
            summary: "Runtime started",
            createdAt: now
          }
        ]
      })
    );

    const overviewRes = await app.request("/api/overview");
    expect(overviewRes.status).toBe(200);
    const overview = (await overviewRes.json()) as {
      counts: { workItems: number; sessions: number; agents: number; runtimes: number };
      runtimeHealth: { online: number };
      handoffCount: number;
      activeSessionCount: number;
      recentEvents: Array<{ id: string }>;
    };
    expect(overview.counts).toMatchObject({ workItems: 1, sessions: 1, agents: 1, runtimes: 1 });
    expect(overview.runtimeHealth.online).toBe(1);
    expect(overview.handoffCount).toBe(1);
    expect(overview.activeSessionCount).toBe(1);
    expect(overview.recentEvents.map((event) => event.id)).toEqual(["event_1"]);
  });
});
