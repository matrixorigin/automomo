import { describe, expect, it } from "vitest";
import {
  composePiPrompt,
  createPiSdkSessionFactory,
  createMetadataOnlyRunner,
  createPiSdkRunner,
  decodePiOutcome,
  mapPiEvent
} from "../src/index";

const now = "2026-04-20T08:00:00.000Z";

const context = {
  session: {
    id: "session_1",
    codebaseId: "codebase_1",
    workItemId: "work_1",
    agentId: "agent_1",
    runtimeId: "runtime_1",
    status: "leased" as const,
    participants: [],
    metadata: { orchestration: { ruleId: "rule_1", reason: "labels matched" } },
    createdAt: now,
    updatedAt: now
  },
  runtime: {
    id: "runtime_1",
    name: "Local Pi",
    mode: "local" as const,
    provider: "pi" as const,
    environment: { workspaceRoot: "/tmp/work", networkPolicy: "restricted" as const, env: { API_TOKEN: "secret" }, secretRefs: [] },
    status: "online" as const,
    capacity: 1,
    activeSessions: 0,
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  workItem: {
    id: "work_1",
    codebaseId: "codebase_1",
    title: "Fix runtime lease",
    body: "Keep the lease protocol stable.",
    source: "manual" as const,
    status: "open" as const,
    priority: "high" as const,
    labels: ["runtime"],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  agent: {
    id: "agent_1",
    name: "Ralph",
    role: "reviewer",
    description: "Reviews runtime behavior.",
    model: "gpt-5.4",
    instructions: "Work carefully.",
    skills: ["runtime"],
    tools: ["shell"],
    maxConcurrency: 1,
    metadata: {},
    createdAt: now,
    updatedAt: now
  }
};

describe("Pi runtime SDK adapter", () => {
  it("keeps metadata-only runner available", async () => {
    const runner = createMetadataOnlyRunner({ now: () => new Date(now) });
    const result = await runner.run(context);

    expect(result.events[0]?.metadata).toMatchObject({ adapter: "pi" });
    expect(result.outcome.result).toMatchObject({ runtimeId: "runtime_1" });
  });

  it("composes prompts from work item, orchestration, agent, and outcome schema without secrets", () => {
    const prompt = composePiPrompt(context);

    expect(prompt).toContain("Fix runtime lease");
    expect(prompt).toContain("rule_1");
    expect(prompt).toContain("Work carefully.");
    expect(prompt).toContain("fenced JSON");
    expect(prompt).toContain("artifacts");
    expect(prompt).toContain("patch summaries");
    expect(prompt).not.toContain("secret");
  });

  it("maps Pi events to automomo session events", () => {
    expect(mapPiEvent({ type: "text_delta", text: "hello" }, { sessionId: "session_1", sequence: 2, createdAt: now })).toMatchObject({
      kind: "text",
      summary: "hello",
      sequence: 2,
      metadata: { piEventType: "text_delta" }
    });
    expect(mapPiEvent({ type: "tool_call", name: "shell" }, { sessionId: "session_1", sequence: 3, createdAt: now })).toMatchObject({
      kind: "tool",
      summary: "Tool call: shell"
    });
  });

  it("decodes fenced JSON outcomes and preserves malformed output as failure", () => {
    const success = decodePiOutcome({
      sessionId: "session_1",
      text: "```json\n{\"status\":\"success\",\"summary\":\"Done\",\"result\":{\"ok\":true},\"artifacts\":[{\"type\":\"patch\",\"title\":\"Current diff\",\"content\":\"diff --git a/file b/file\"}]}\n```",
      createdAt: now
    });
    const malformed = decodePiOutcome({ sessionId: "session_1", text: "not json", createdAt: now });
    const invalidArtifact = decodePiOutcome({
      sessionId: "session_1",
      text: "{\"status\":\"success\",\"summary\":\"Done\",\"result\":{},\"artifacts\":[{\"type\":\"sheet\",\"title\":\"Legacy\"}]}",
      createdAt: now
    });

    expect(success.outcome).toMatchObject({ status: "success", summary: "Done", result: { ok: true } });
    expect(success.artifacts[0]).toMatchObject({ type: "patch", title: "Current diff" });
    expect(malformed.outcome.status).toBe("failed");
    expect(malformed.events[0]?.kind).toBe("failure");
    expect(invalidArtifact.outcome.status).toBe("failed");
    expect(invalidArtifact.artifacts).toEqual([]);
  });

  it("runs SDK mode with an injected session factory", async () => {
    const calls: string[] = [];
    const runner = createPiSdkRunner({
      now: () => new Date(now),
      sessionFactory: async ({ prompt }) => {
        calls.push(prompt);
        return {
          events: [{ type: "text_delta", text: "working" }],
          finalText: "{\"status\":\"needs_human\",\"summary\":\"Need input\",\"result\":{\"question\":\"approve?\"},\"artifacts\":[{\"type\":\"review\",\"title\":\"Review note\",\"content\":\"Please approve.\"}]}"
        };
      }
    });

    const result = await runner.run(context);

    expect(calls[0]).toContain("Fix runtime lease");
    expect(result.events.map((event) => event.kind)).toContain("text");
    expect(result.outcome).toMatchObject({ status: "needs_human", summary: "Need input" });
    expect(result.artifacts?.[0]).toMatchObject({ type: "review", title: "Review note" });
  });

  it("adapts the default Pi createAgentSession SDK path without making a live model call in tests", async () => {
    const prompts: string[] = [];
    const factory = createPiSdkSessionFactory({
      createAgentSession: async (options) => {
        expect(options?.cwd).toBe("/tmp/work");
        expect(options?.thinkingLevel).toBe("high");
        return {
          session: {
            subscribe: (listener: (event: unknown) => void) => {
              listener({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "working" } });
              return () => undefined;
            },
            prompt: async (prompt: string) => {
              prompts.push(prompt);
            },
            agent: {
              state: {
                messages: [
                  {
                    role: "assistant",
                    content: [{ type: "text", text: "{\"status\":\"success\",\"summary\":\"SDK done\",\"result\":{\"ok\":true}}" }]
                  }
                ]
              }
            }
          }
        };
      }
    });

    const result = await factory({
      prompt: "Run the session",
      context,
      config: { mode: "sdk", thinkingLevel: "high", cwd: "/tmp/work", toolsMode: "readonly", skills: [], contextFiles: [], outcomeSchema: {} }
    });

    expect(prompts).toEqual(["Run the session"]);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "message_update" }));
    expect(result.finalText).toContain("SDK done");
  });
});
