import { describe, expect, it } from "vitest";
import { composePiPrompt, createPiRuntimeAdapter } from "../src/index";

const now = "2026-04-20T08:00:00.000Z";

describe("PiRuntimeAdapter", () => {
  it("translates an automomo session into metadata-only events and an outcome", async () => {
    const adapter = createPiRuntimeAdapter({ now: () => new Date(now) });

    const result = await adapter.runSession({
      session: {
        id: "session_1",
        codebaseId: "codebase_1",
        workItemId: "work_1",
        runtimeId: "runtime_1",
        agentId: "agent_1",
        status: "leased",
        participants: [],
        metadata: {},
        createdAt: now,
        updatedAt: now
      },
      runtime: {
        id: "runtime_1",
        name: "Local Pi runtime",
        mode: "local",
        provider: "pi",
        environment: { networkPolicy: "restricted", env: {}, secretRefs: [] },
        status: "online",
        capacity: 1,
        activeSessions: 0,
        metadata: {},
        createdAt: now,
        updatedAt: now
      },
      workItem: {
        id: "work_1",
        codebaseId: "codebase_1",
        title: "Investigate lease behavior",
        body: "",
        source: "manual",
        status: "open",
        priority: "medium",
        labels: [],
        metadata: {},
        createdAt: now,
        updatedAt: now
      },
      agent: {
        id: "agent_1",
        name: "Ralph",
        instructions: "Work carefully.",
        skills: [],
        tools: [],
        maxConcurrency: 1,
        metadata: {},
        createdAt: now,
        updatedAt: now
      }
    });

    expect(result.events[0]?.kind).toBe("runtime");
    expect(result.events[0]?.metadata).toMatchObject({ adapter: "pi" });
    expect(result.outcome.result).toMatchObject({ runtimeId: "runtime_1", agentId: "agent_1" });
  });

  it("composes a room workspace prompt from Oz run metadata", () => {
    const prompt = composePiPrompt({
      session: {
        id: "run_1",
        codebaseId: "runtime_1",
        roomId: "room_1",
        agentId: "agent_1",
        runtimeId: "runtime_1",
        status: "running",
        participants: [],
        metadata: {
          room: { id: "room_1", name: "Build Room", description: "Implement automomo" },
          context: [{ authorName: "Human", content: "@Builder review this", authorType: "human" }]
        },
        createdAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z"
      },
      runtime: {
        id: "runtime_1",
        name: "Local Runtime",
        mode: "remote_daemon",
        provider: "pi",
        environment: { workspaceRoot: "/repo", networkPolicy: "restricted", env: {}, secretRefs: [] },
        status: "online",
        capacity: 1,
        activeSessions: 0,
        metadata: {},
        createdAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z"
      },
      agent: {
        id: "agent_1",
        name: "Builder",
        model: "pi",
        instructions: "Write code carefully.",
        skills: [],
        tools: [],
        defaultRuntimeId: "runtime_1",
        maxConcurrency: 1,
        metadata: {},
        createdAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z"
      },
      workItem: {
        id: "run_1",
        codebaseId: "runtime_1",
        roomId: "room_1",
        title: "Room request",
        body: "@Builder review this",
        source: "manual",
        status: "running",
        priority: "medium",
        labels: [],
        metadata: {},
        createdAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z"
      }
    });

    expect(prompt).toContain("Room: Build Room");
    expect(prompt).toContain("Implement automomo");
    expect(prompt).toContain("Workspace root: /repo");
    expect(prompt).toContain("Human: @Builder review this");
    expect(prompt).toContain("Write code carefully.");
    expect(prompt).toContain("fenced JSON");
  });
});
