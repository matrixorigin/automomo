import { describe, expect, it } from "vitest";
import { createPiRuntimeAdapter } from "../src/index";

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
});
