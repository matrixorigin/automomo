import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoomWorkBoard } from "./RoomWorkBoard";

const now = "2026-04-20T08:00:00.000Z";

describe("RoomWorkBoard", () => {
  it("groups work into Open, Active, Human, and Done columns", () => {
    const html = renderToStaticMarkup(
      <RoomWorkBoard
        roomId="room_1"
        initialItems={[
          createItem({ id: "work_open", status: "open", title: "Open task" }),
          createItem({ id: "work_ready", status: "ready", title: "Ready task" }),
          createItem({ id: "work_running", status: "running", title: "Running task" }),
          createItem({ id: "work_human", status: "needs_human", title: "Needs human task" }),
          createItem({ id: "work_done", status: "completed", title: "Completed task" }),
          createItem({ id: "work_failed", status: "failed", title: "Failed task" }),
          createItem({ id: "work_cancelled", status: "cancelled", title: "Cancelled task" })
        ]}
      />
    );

    expect(html).toContain("Open");
    expect(html).toContain("Active");
    expect(html).toContain("Human");
    expect(html).toContain("Done");
    expect(html).toContain("Open task");
    expect(html).toContain("Ready task");
    expect(html).toContain("Running task");
    expect(html).toContain("Needs human task");
    expect(html).toContain("Completed task");
    expect(html).toContain("Failed task");
    expect(html).toContain("Cancelled task");
  });

  it("renders card details and status action controls wired to PATCH endpoint metadata", () => {
    const html = renderToStaticMarkup(
      <RoomWorkBoard
        roomId="room_1"
        initialItems={[
          createItem({
            id: "work_card",
            status: "ready",
            title: "Investigate room flow",
            priority: "high",
            labels: ["room", "runtime"],
            source: "api"
          })
        ]}
      />
    );

    expect(html).toContain("Investigate room flow");
    expect(html).toContain("high");
    expect(html).toContain("room");
    expect(html).toContain("runtime");
    expect(html).toContain("api");
    expect(html).toContain("ready");
    expect(html).toContain('data-work-item-patch-endpoint="/api/work-items/work_card"');
    expect(html).toContain('name="status"');
    expect(html).toContain("Update");
  });
});

function createItem(
  overrides: Partial<{
    id: string;
    roomId: string;
    title: string;
    body: string;
    source: "manual" | "api" | "webhook" | "schedule" | "sync";
    status: "open" | "ready" | "running" | "needs_human" | "completed" | "failed" | "cancelled";
    priority: "urgent" | "high" | "medium" | "low";
    labels: string[];
  }>
) {
  return {
    id: overrides.id ?? "work_1",
    codebaseId: "codebase_1",
    roomId: overrides.roomId ?? "room_1",
    title: overrides.title ?? "Work item",
    body: overrides.body ?? "Body",
    source: overrides.source ?? "manual",
    status: overrides.status ?? "open",
    priority: overrides.priority ?? "medium",
    labels: overrides.labels ?? [],
    metadata: {},
    createdAt: now,
    updatedAt: now
  };
}
