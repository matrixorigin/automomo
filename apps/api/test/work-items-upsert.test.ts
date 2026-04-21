import { describe, expect, it } from "vitest";
import { upsertWorkItemFromSource } from "../src/work-items/upsert";
import { MemoryStore } from "../src/store";

const now = "2026-04-20T08:00:00.000Z";
const later = "2026-04-20T08:01:00.000Z";

describe("source work item upserts", () => {
  it("preserves room assignments and rejects rooms outside the codebase", () => {
    const store = new MemoryStore();
    store.saveCodebase({
      id: "codebase_1",
      name: "automomo",
      provider: "git",
      status: "active",
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    store.saveCodebase({
      id: "codebase_2",
      name: "sidecar",
      provider: "git",
      status: "active",
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    store.saveRoom({
      id: "room_1",
      codebaseId: "codebase_1",
      name: "Runtime room",
      description: "",
      status: "active",
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    store.saveRoom({
      id: "room_2",
      codebaseId: "codebase_2",
      name: "Foreign room",
      description: "",
      status: "active",
      metadata: {},
      createdAt: now,
      updatedAt: now
    });

    const first = upsertWorkItemFromSource({
      store,
      now,
      idFactory: (prefix) => `${prefix}_1`,
      request: {
        codebaseId: "codebase_1",
        roomId: "room_1",
        connector: { type: "manual", id: "room-work", metadata: {} },
        title: "Seed room work",
        body: "",
        labels: [],
        priority: "medium",
        source: "api",
        status: "open",
        metadata: {},
        evaluateRules: false
      }
    });
    expect(first.workItem.roomId).toBe("room_1");

    const second = upsertWorkItemFromSource({
      store,
      now: later,
      idFactory: (prefix) => `${prefix}_2`,
      request: {
        codebaseId: "codebase_1",
        connector: { type: "manual", id: "room-work", metadata: {} },
        title: "Refresh room work",
        body: "",
        labels: [],
        priority: "medium",
        source: "api",
        status: "open",
        metadata: {},
        evaluateRules: false
      }
    });
    expect(second.workItem.roomId).toBe("room_1");

    expect(() =>
      upsertWorkItemFromSource({
        store,
        now: later,
        request: {
          codebaseId: "codebase_1",
          roomId: "room_2",
          connector: { type: "manual", id: "bad-room-work", metadata: {} },
          title: "Bad room work",
          body: "",
          labels: [],
          priority: "medium",
          source: "api",
          status: "open",
          metadata: {},
          evaluateRules: false
        }
      })
    ).toThrow(/does not belong to codebase/);
  });
});
