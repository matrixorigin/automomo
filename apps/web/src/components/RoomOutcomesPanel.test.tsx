import React from "react";
import { SessionDetailResponse } from "@automomo/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoomOutcomesPanel } from "./RoomOutcomesPanel";

const now = "2026-04-21T08:00:00.000Z";

describe("RoomOutcomesPanel", () => {
  it("renders an empty state when there are no outcomes", () => {
    const html = renderToStaticMarkup(<RoomOutcomesPanel outcomes={[]} />);

    expect(html).toContain("No outcomes yet");
  });

  it("renders a successful outcome summary", () => {
    const html = renderToStaticMarkup(
      <RoomOutcomesPanel
        outcomes={[
          createOutcomeDetail({
            sessionId: "session_success",
            workItemTitle: "Land room outcomes panel",
            status: "success",
            summary: "Patched room outcomes into workspace tabs."
          })
        ]}
      />
    );

    expect(html).toContain("Patched room outcomes into workspace tabs.");
    expect(html).toContain("SESSION_SUCCESS");
    expect(html).toContain("Land room outcomes panel");
  });

  it("renders failed tone for failed outcomes", () => {
    const html = renderToStaticMarkup(
      <RoomOutcomesPanel
        outcomes={[
          createOutcomeDetail({
            sessionId: "session_failed",
            workItemTitle: "Run migrations",
            status: "failed",
            summary: "Migration failed in staging due to drift."
          })
        ]}
      />
    );

    expect(html).toContain("tone-red");
    expect(html).toContain("Migration failed in staging due to drift.");
  });
});

function createOutcomeDetail({
  sessionId,
  workItemTitle,
  status,
  summary
}: {
  sessionId: string;
  workItemTitle: string;
  status: "success" | "failed" | "needs_human";
  summary: string;
}): SessionDetailResponse {
  return {
    session: {
      id: sessionId,
      codebaseId: "codebase_1",
      roomId: "room_1",
      workItemId: "work_1",
      agentId: "agent_1",
      runtimeId: "runtime_1",
      status: status === "success" ? "completed" : "failed",
      participants: [],
      metadata: {},
      createdAt: now,
      updatedAt: now
    },
    events: [],
    handoffs: [],
    outcome: {
      id: `${sessionId}_outcome`,
      sessionId,
      status,
      summary,
      result: {},
      eventsUploaded: 2,
      createdAt: now
    },
    workItem: {
      id: "work_1",
      codebaseId: "codebase_1",
      roomId: "room_1",
      title: workItemTitle,
      body: "",
      source: "manual",
      status: "completed",
      priority: "medium",
      labels: [],
      metadata: {},
      createdAt: now,
      updatedAt: now
    },
    agent: undefined,
    runtime: undefined,
    room: undefined
  };
}
