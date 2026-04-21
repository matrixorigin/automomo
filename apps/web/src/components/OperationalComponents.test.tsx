import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentEditor } from "./AgentEditor";
import { EmptyState } from "./EmptyState";
import { buildHandoffPayload, HandoffControls } from "./HandoffControls";
import { buildRoomPayload, RoomEditor } from "./RoomEditor";
import { RuntimeEditor } from "./RuntimeEditor";
import { RuntimeHealthBadge } from "./RuntimeHealthBadge";
import { RuntimePresenceBadge } from "./RuntimePresenceBadge";
import { buildRulePayload, RuleEditor } from "./RuleEditor";
import { SessionDetailPanel } from "./SessionDetailPanel";
import { StatusStrip } from "./StatusStrip";
import { buildAgentPayload } from "./AgentEditor";
import { buildRuntimePayload } from "./RuntimeEditor";
import { AgentAvatar } from "./AgentAvatar";
import { RoomChatStream } from "./RoomChatStream";

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
        <RuleEditor
          codebases={[{ id: "codebase_1", name: "Automomo" }]}
          agents={[{ id: "agent_1", name: "Ralph" }]}
          runtimes={[{ id: "runtime_1", name: "Local Pi" }]}
        />
        <AgentEditor runtimes={[{ id: "runtime_1", name: "Local Pi" }]} />
        <RuntimeEditor />
        <RuntimeHealthBadge status="idle" />
        <RuntimeHealthBadge status="online" />
        <RuntimeHealthBadge status="offline" />
        <RuntimeHealthBadge status="busy" />
        <RuntimeHealthBadge status="unhealthy" />
        <RuntimePresenceBadge
          runtime={{
            id: "runtime_1",
            name: "Local Pi",
            mode: "local",
            provider: "pi",
            environment: { networkPolicy: "restricted", env: {}, secretRefs: [] },
            status: "online",
            capacity: 1,
            activeSessions: 2,
            metadata: {},
            createdAt: now,
            updatedAt: now
          }}
        />
      </>
    );

    expect(html).toContain("Rule name");
    expect(html).toContain("Agent name");
    expect(html).toContain("Runtime name");
    expect(html).toContain("idle");
    expect(html).toContain("online");
    expect(html).toContain("offline");
    expect(html).toContain("busy");
    expect(html).toContain("unhealthy");
    expect(html).toContain("Local");
    expect(html).toContain("2 sessions");
  });

  it("renders JSON-backed mutation forms and builds API payloads from form data", () => {
    const html = renderToStaticMarkup(
      <>
        <RuleEditor
          codebases={[{ id: "codebase_1", name: "Automomo" }]}
          agents={[{ id: "agent_1", name: "Ralph" }]}
          runtimes={[{ id: "runtime_1", name: "Local Pi" }]}
        />
        <RoomEditor codebases={[{ id: "codebase_1", name: "Automomo" }]} />
        <AgentEditor runtimes={[{ id: "runtime_1", name: "Local Pi" }]} />
        <RuntimeEditor />
        <HandoffControls sessionId="session_1" />
      </>
    );
    expect(html).toContain('data-json-endpoint="/api/orchestration-rules"');
    expect(html).toContain('data-json-endpoint="/api/rooms"');
    expect(html).toContain('data-json-endpoint="/api/agents"');
    expect(html).toContain('data-json-endpoint="/api/runtimes"');
    expect(html).toContain('data-json-endpoint="/api/sessions/session_1/handoff"');
    expect(html).not.toContain('method="post"');

    expect(
      buildAgentPayload(
        formData({
          name: "Ralph",
          model: "gpt-5.4",
          instructions: "Work carefully.",
          skills: "runtime, testing",
          tools: "shell, git",
          defaultRuntimeId: "runtime_1",
          maxConcurrency: "2"
        })
      )
    ).toMatchObject({ skills: ["runtime", "testing"], tools: ["shell", "git"], maxConcurrency: 2 });
    expect(
      buildRulePayload(
        formData({
          codebaseId: "codebase_1",
          name: "Runtime rule",
          trigger: "webhook",
          labels: "runtime,ui",
          priority: "high",
          agentId: "agent_1",
          runtimeId: "runtime_1",
          enabled: "on",
          humanApproval: "on_risk"
        })
      )
    ).toMatchObject({ codebaseId: "codebase_1", match: { labels: ["runtime", "ui"], priority: ["high"] } });
    expect(
      buildRuntimePayload(
        formData({
          name: "Local",
          mode: "local",
          provider: "docker",
          workspaceRoot: "/tmp/work",
          image: "node:22",
          command: "pnpm test",
          capacity: "3",
          networkPolicy: "disabled",
          secretRefs: "GITHUB_TOKEN,OPENAI_API_KEY"
        })
      )
    ).toMatchObject({
      provider: "docker",
      capacity: 3,
      environment: { command: ["pnpm", "test"], secretRefs: ["GITHUB_TOKEN", "OPENAI_API_KEY"] }
    });
    expect(buildRoomPayload(formData({ codebaseId: "codebase_1", name: "Shared room", description: "Pairing" }))).toMatchObject({
      codebaseId: "codebase_1",
      name: "Shared room",
      description: "Pairing"
    });
    expect(buildHandoffPayload(formData({ action: "claim", claimedBy: "mo" }))).toMatchObject({ action: "claim", claimedBy: "mo" });
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
    expect(html).toContain("Claim");
    expect(html).toContain("Approve");
  });

  it("renders agent avatar with deterministic visuals and accessible title", () => {
    const html = renderToStaticMarkup(
      <AgentAvatar
        agent={{
          id: "agent_1",
          name: "Ralph",
          metadata: { color: "#3B82F6", icon: "robot" }
        }}
      />
    );

    expect(html).toContain("title=\"Agent Ralph (robot)\"");
    expect(html).toContain("background:#3B82F6");
    expect(html).toContain(">R<");
  });

  it("renders chat stream oldest-first with author labels and mention tokens", () => {
    const html = renderToStaticMarkup(
      <RoomChatStream
        roomId="room_1"
        agentNames={["Ralph", "Nova"]}
        initialMessages={[
          {
            id: "message_2",
            roomId: "room_1",
            author: { type: "agent", agentId: "agent_1", name: "Ralph" },
            body: "@Operator pulled latest branch.",
            metadata: {},
            createdAt: "2026-04-20T08:01:00.000Z",
            updatedAt: "2026-04-20T08:01:00.000Z"
          },
          {
            id: "message_1",
            roomId: "room_1",
            author: { type: "human", name: "Operator" },
            body: "@Ralph please inspect runtime changes.",
            metadata: {},
            createdAt: "2026-04-20T08:00:00.000Z",
            updatedAt: "2026-04-20T08:00:00.000Z"
          },
          {
            id: "message_3",
            roomId: "room_1",
            author: { type: "system", name: "Runtime daemon" },
            body: "Health check complete.",
            metadata: {},
            createdAt: "2026-04-20T08:02:00.000Z",
            updatedAt: "2026-04-20T08:02:00.000Z"
          }
        ]}
      />
    );

    expect(html).toContain("Human Operator");
    expect(html).toContain("Agent Ralph");
    expect(html).toContain("Runtime daemon");
    expect(html).toContain("mention-token");
    expect(html.indexOf("@Ralph please inspect runtime changes.")).toBeLessThan(html.indexOf("@Operator pulled latest branch."));
    expect(html).not.toContain("window.location.reload");
  });
});

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}
