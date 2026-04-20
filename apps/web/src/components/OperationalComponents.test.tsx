import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentEditor } from "./AgentEditor";
import { EmptyState } from "./EmptyState";
import { RuntimeEditor } from "./RuntimeEditor";
import { RuntimeHealthBadge } from "./RuntimeHealthBadge";
import { RuleEditor } from "./RuleEditor";
import { SessionDetailPanel } from "./SessionDetailPanel";
import { StatusStrip } from "./StatusStrip";

const now = "2026-04-20T08:00:00.000Z";

describe("operational web components", () => {
  it("renders compact status and empty states without old product vocabulary", () => {
    const html = renderToStaticMarkup(
      <>
        <StatusStrip
          overview={{
            counts: { codebases: 1, workItems: 0, sessions: 0, agents: 0, runtimes: 0 },
            runtimeHealth: { idle: 0, online: 1, offline: 0, busy: 0, unhealthy: 0 },
            handoffCount: 0,
            daemonCount: 1,
            activeSessionCount: 0,
            recentEvents: []
          }}
        />
        <EmptyState title="No work items" body="Create source-neutral work for this codebase." action="New item" />
      </>
    );

    expect(html).toContain("Runtime health");
    expect(html).toContain("Daemons");
    expect(html).toContain("No work items");
    expect(html).not.toContain("Auto-Mobile");
    expect(html).not.toContain("Pull Requests");
  });

  it("renders editor workflows and runtime health badges", () => {
    const html = renderToStaticMarkup(
      <>
        <RuleEditor agents={[{ id: "agent_1", name: "Ralph" }]} runtimes={[{ id: "runtime_1", name: "Local Pi" }]} />
        <AgentEditor runtimes={[{ id: "runtime_1", name: "Local Pi" }]} />
        <RuntimeEditor />
        <RuntimeHealthBadge status="online" />
        <RuntimeHealthBadge status="unhealthy" />
      </>
    );

    expect(html).toContain("Rule name");
    expect(html).toContain("Agent name");
    expect(html).toContain("Runtime name");
    expect(html).toContain("online");
    expect(html).toContain("unhealthy");
  });

  it("renders session detail with timeline, handoffs, outcome, and controls", () => {
    const html = renderToStaticMarkup(
      <SessionDetailPanel
        detail={{
          session: {
            id: "session_1",
            codebaseId: "codebase_1",
            status: "needs_human",
            participants: [{ type: "agent", id: "agent_1", name: "Ralph" }],
            metadata: {},
            createdAt: now,
            updatedAt: now
          },
          events: [
            {
              id: "event_1",
              sessionId: "session_1",
              sequence: 0,
              kind: "handoff",
              summary: "Human input requested",
              metadata: {},
              createdAt: now
            }
          ],
          handoffs: [
            {
              id: "handoff_1",
              sessionId: "session_1",
              status: "requested",
              reason: "Need input",
              note: "",
              createdAt: now,
              updatedAt: now
            }
          ],
          outcome: undefined,
          workItem: undefined,
          agent: undefined,
          runtime: undefined
        }}
      />
    );

    expect(html).toContain("session_1");
    expect(html).toContain("Human input requested");
    expect(html).toContain("Resume");
  });
});
