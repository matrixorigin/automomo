import { describe, expect, it } from "vitest";
import {
  AgentRunEventUploadSchema,
  AgentRunLeaseResponseSchema,
  AgentRunOutcomeUploadSchema,
  ApiKeySchema,
  AuditEventSchema,
  CodebaseSchema,
  DaemonRegistrationResponseSchema,
  DaemonSchema,
  EnvironmentSchema,
  HandoffActionSchema,
  LeaseOutcomeUploadSchema,
  LeaseRenewRequestSchema,
  OverviewSchema,
  PiRuntimeConfigSchema,
  RuleEvaluationResultSchema,
  RuntimeExecutionRequestSchema,
  RuntimeExecutionResultSchema,
  SessionDetailResponseSchema,
  SessionEventEnvelopeSchema,
  SessionListQuerySchema,
  SessionStartRequestSchema,
  WorkItemListQuerySchema,
  WorkItemListResponseSchema,
  WorkItemUpsertRequestSchema,
  WorkItemSchema
} from "../src/index";

const now = "2026-04-20T08:00:00.000Z";

describe("automomo protocol schemas", () => {
  it("parses a source-neutral codebase with defaults", () => {
    const codebase = CodebaseSchema.parse({
      id: "codebase_1",
      name: "automomo",
      provider: "git",
      createdAt: now,
      updatedAt: now
    });

    expect(codebase.status).toBe("active");
    expect(codebase.metadata).toEqual({});
  });

  it("parses a local pi environment with defaults", () => {
    const environment = EnvironmentSchema.parse({
      id: "environment_local",
      workspaceId: "workspace_1",
      name: "Local automomo",
      workspaceRoot: "/repo",
      createdAt: now,
      updatedAt: now
    });

    expect(environment.kind).toBe("local");
    expect(environment.command).toBe("pi");
    expect(environment.status).toBe("offline");
  });

  it("rejects empty identifiers before they reach API state", () => {
    expect(() =>
      WorkItemSchema.parse({
        id: "",
        codebaseId: "codebase_1",
        title: "Investigate runtime lease",
        createdAt: now,
        updatedAt: now
      })
    ).toThrow();
  });

  it("keeps session event envelopes stable for realtime consumers", () => {
    const envelope = SessionEventEnvelopeSchema.parse({
      type: "session.event",
      version: 1,
      payload: {
        id: "event_1",
        sessionId: "session_1",
        sequence: 0,
        kind: "runtime",
        summary: "Runtime accepted lease",
        createdAt: now
      }
    });

    expect(envelope.payload.metadata).toEqual({});
    expect(envelope.payload.kind).toBe("runtime");
  });

  it("validates daemon outcome uploads against a lease and session", () => {
    const upload = LeaseOutcomeUploadSchema.parse({
      runtimeId: "runtime_1",
      leaseId: "lease_1",
      sessionId: "session_1",
      outcome: {
        id: "outcome_1",
        sessionId: "session_1",
        status: "success",
        summary: "Produced a reviewable patch",
        result: { patchReady: true },
        createdAt: now
      }
    });

    expect(upload.outcome.eventsUploaded).toBe(0);
    expect(upload.outcome.result).toEqual({ patchReady: true });
  });

  it("models automomo AgentRun daemon leases and outcomes", () => {
    const leaseResponse = AgentRunLeaseResponseSchema.parse({
      lease: {
        leaseId: "lease_1",
        run: {
          id: "run_1",
          roomId: "room_1",
          agentId: "agent_1",
          runtimeId: "runtime_1",
          prompt: "Build it",
          sourceMessageId: "message_1",
          depth: 0
        },
        room: { id: "room_1", name: "Room", description: "" },
        agent: {
          id: "agent_1",
          name: "Builder",
          systemPrompt: "Build carefully",
          skills: ["typescript"],
          mcpServers: []
        },
        runtime: {
          id: "runtime_1",
          name: "Local runtime",
          provider: "pi",
          workspaceRoot: "/repo",
          environment: { workspaceRoot: "/repo" }
        },
        context: [
          {
            id: "message_1",
            authorType: "human",
            authorName: "User",
            content: "Please build it",
            timestamp: now
          }
        ],
        expiresAt: now
      }
    });
    const eventUpload = AgentRunEventUploadSchema.parse({
      runtimeId: "runtime_1",
      leaseId: "lease_1",
      runId: "run_1",
      events: [{ summary: "Started runtime" }]
    });
    const outcomeUpload = AgentRunOutcomeUploadSchema.parse({
      runtimeId: "runtime_1",
      leaseId: "lease_1",
      runId: "run_1",
      content: "Done",
      outcome: { status: "success", summary: "Done", result: { ok: true } },
      sessionUrl: null
    });

    expect(leaseResponse.lease?.run.id).toBe("run_1");
    expect(eventUpload.events[0]?.kind).toBe("runtime");
    expect(outcomeUpload.outcome.result).toEqual({ ok: true });
  });

  it("parses overview state for live web surfaces", () => {
    const overview = OverviewSchema.parse({
      counts: {
        codebases: 1,
        workItems: 2,
        sessions: 3,
        agents: 1,
        runtimes: 2
      },
      runtimeHealth: { online: 1, busy: 1, offline: 0, idle: 0, unhealthy: 0 },
      handoffCount: 1,
      daemonCount: 1,
      activeSessionCount: 2,
      recentEvents: [
        {
          id: "event_1",
          sessionId: "session_1",
          sequence: 0,
          kind: "runtime",
          summary: "Runtime accepted session",
          createdAt: now
        }
      ]
    });

    expect(overview.counts.workItems).toBe(2);
    expect(overview.recentEvents[0]?.metadata).toEqual({});
  });

  it("models room collaboration nouns and room-linked sessions", async () => {
    const protocol = await import("../src/index");

    const room = protocol.RoomSchema.parse({
      id: "room_1",
      codebaseId: "codebase_1",
      name: "Shared room",
      createdAt: now,
      updatedAt: now
    });
    const roomAgent = protocol.RoomAgentSchema.parse({
      id: "room_agent_1",
      roomId: "room_1",
      agentId: "agent_1",
      createdAt: now,
      updatedAt: now
    });
    const message = protocol.RoomMessageSchema.parse({
      id: "message_1",
      roomId: "room_1",
      author: { type: "agent", agentId: "agent_1", name: "Ralph" },
      body: "Working the patch together.",
      createdAt: now,
      updatedAt: now
    });
    const task = protocol.RoomTaskSchema.parse({
      id: "task_1",
      roomId: "room_1",
      title: "Draft patch",
      assignedAgentId: "agent_1",
      workItemId: "work_1",
      createdAt: now,
      updatedAt: now
    });
    const session = protocol.SessionSchema.parse({
      id: "session_1",
      codebaseId: "codebase_1",
      roomId: "room_1",
      createdAt: now,
      updatedAt: now
    });
    const rooms = protocol.RoomListResponseSchema.parse({
      items: [room],
      page: { limit: 50, offset: 0, total: 1 }
    });

    expect(room.status).toBe("active");
    expect(room.metadata).toEqual({});
    expect(roomAgent.metadata).toEqual({});
    expect(message.author.type).toBe("agent");
    expect(task.status).toBe("open");
    expect(session.roomId).toBe("room_1");
    expect(rooms.items[0]?.id).toBe("room_1");
  });

  it("models room-scoped work items and room work filters", async () => {
    const protocol = await import("../src/index");

    const workItem = protocol.WorkItemSchema.parse({
      id: "work_1",
      codebaseId: "codebase_1",
      roomId: "room_1",
      title: "Build room board",
      createdAt: now,
      updatedAt: now
    });
    const query = protocol.WorkItemListQuerySchema.parse({
      codebaseId: "codebase_1",
      roomId: "room_1",
      status: "ready"
    });
    const upsert = protocol.WorkItemUpsertRequestSchema.parse({
      codebaseId: "codebase_1",
      roomId: "room_1",
      connector: { type: "manual", id: "room-work-1", metadata: {} },
      title: "Seed room work"
    });

    expect(workItem.roomId).toBe("room_1");
    expect(query.roomId).toBe("room_1");
    expect(upsert.roomId).toBe("room_1");
    expect(() =>
      protocol.WorkItemSchema.parse({
        id: "work_2",
        codebaseId: "codebase_1",
        roomId: "",
        title: "Invalid room",
        createdAt: now,
        updatedAt: now
      })
    ).toThrow();
  });

  it("defaults list filters and rejects invalid enum values", () => {
    expect(WorkItemListQuerySchema.parse({})).toMatchObject({ limit: 50, offset: 0 });
    expect(SessionListQuerySchema.parse({ limit: "200", offset: "10" })).toMatchObject({ limit: 200, offset: 10 });

    expect(() => WorkItemListQuerySchema.parse({ status: "reviewing" })).toThrow();
    expect(() => WorkItemListQuerySchema.parse({ limit: 201 })).toThrow();
    expect(() => SessionListQuerySchema.parse({ status: "unknown" })).toThrow();
  });

  it("wraps list responses with stable pagination metadata", () => {
    const response = WorkItemListResponseSchema.parse({
      items: [
        {
          id: "work_1",
          codebaseId: "codebase_1",
          title: "Run local runtime",
          createdAt: now,
          updatedAt: now
        }
      ],
      page: { limit: 50, offset: 0, total: 1 }
    });

    expect(response.items[0]?.status).toBe("open");
    expect(response.page.total).toBe(1);
  });

  it("models orchestration matches and session start requests", () => {
    const matched = RuleEvaluationResultSchema.parse({
      matched: true,
      ruleId: "rule_1",
      reason: "labels matched runtime",
      agentId: "agent_1",
      runtimeId: "runtime_1",
      requiresHumanApproval: true
    });
    const noMatch = RuleEvaluationResultSchema.parse({
      matched: false,
      reason: "no enabled rule matched"
    });
    const start = SessionStartRequestSchema.parse({ workItemId: "work_1", trigger: "manual" });

    expect(matched.matched ? matched.ruleId : undefined).toBe("rule_1");
    expect(noMatch.matched).toBe(false);
    expect(start.trigger).toBe("manual");
  });

  it("models handoff actions and session detail responses", () => {
    const action = HandoffActionSchema.parse({
      action: "claim",
      reason: "Human is taking over",
      claimedBy: "randomradio"
    });
    const detail = SessionDetailResponseSchema.parse({
      session: {
        id: "session_1",
        codebaseId: "codebase_1",
        status: "needs_human",
        participants: [],
        metadata: {},
        createdAt: now,
        updatedAt: now
      },
      events: [],
      handoffs: [],
      outcome: undefined,
      workItem: undefined,
      agent: undefined,
      runtime: undefined
    });

    expect(action.action).toBe("claim");
    expect(detail.session.id).toBe("session_1");
  });

  it("models daemon identity, lease renewal, runtime execution, ingress, and audit contracts", () => {
    const daemon = DaemonSchema.parse({
      id: "daemon_1",
      runtimeId: "runtime_1",
      name: "Local daemon",
      secretId: "secret_1",
      signatureVersion: "hmac-sha256-v1",
      status: "online",
      createdAt: now,
      updatedAt: now
    });
    const registration = DaemonRegistrationResponseSchema.parse({
      daemon,
      runtime: {
        id: "runtime_1",
        name: "Local daemon",
        mode: "remote_daemon",
        provider: "pi",
        environment: { networkPolicy: "restricted", env: {}, secretRefs: [] },
        status: "online",
        capacity: 1,
        activeSessions: 0,
        metadata: {},
        createdAt: now,
        updatedAt: now
      },
      secret: "daemon-secret"
    });
    const renew = LeaseRenewRequestSchema.parse({ runtimeId: "runtime_1", leaseId: "lease_1" });
    const runtimeRequest = RuntimeExecutionRequestSchema.parse({ sessionId: "session_1", provider: "shell" });
    const runtimeResult = RuntimeExecutionResultSchema.parse({
      sessionId: "session_1",
      status: "success",
      outcomeId: "outcome_1",
      eventsUploaded: 2
    });
    const upsert = WorkItemUpsertRequestSchema.parse({
      codebaseId: "codebase_1",
      connector: { type: "github", id: "issue-1", metadata: { owner: "matrixorigin", repo: "automomo" } },
      title: "Fresh source context",
      source: "webhook"
    });
    const apiKey = ApiKeySchema.parse({
      id: "key_1",
      name: "Webhook key",
      tokenHash: "hash",
      scopes: [{ codebaseId: "codebase_1", actions: ["work_items:write"] }],
      createdAt: now,
      updatedAt: now
    });
    const audit = AuditEventSchema.parse({
      id: "audit_1",
      actorType: "api_key",
      actorId: "key_1",
      action: "work_item.upsert",
      targetType: "work_item",
      targetId: "work_1",
      metadata: { safe: true },
      createdAt: now
    });
    const piConfig = PiRuntimeConfigSchema.parse({ mode: "sdk", cwd: "/tmp/work", toolsMode: "readonly" });

    expect(registration.secret).toBe("daemon-secret");
    expect(renew.leaseId).toBe("lease_1");
    expect(runtimeRequest.provider).toBe("shell");
    expect(runtimeResult.status).toBe("success");
    expect(upsert.connector.metadata).toMatchObject({ repo: "automomo" });
    expect(apiKey.scopes[0]?.actions).toContain("work_items:write");
    expect(audit.actorType).toBe("api_key");
    expect(piConfig.toolsMode).toBe("readonly");
  });
});
