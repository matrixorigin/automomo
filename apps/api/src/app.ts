import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  HandoffActionSchema,
  AgentSchema,
  CodebaseSchema,
  DaemonRegistrationResponseSchema,
  DaemonRegistrationSchema,
  HumanHandoffSchema,
  LeaseEventUploadSchema,
  LeaseFailureUploadSchema,
  LeaseOutcomeUploadSchema,
  LeaseRequestSchema,
  LeaseRenewRequestSchema,
  OrchestrationRuleSchema,
  RoomAgentSchema,
  RoomMessageSchema,
  RoomSchema,
  RoomTaskSchema,
  RuntimeExecutionRequestSchema,
  RuntimeHeartbeatSchema,
  RuntimeSchema,
  SessionEventSchema,
  SessionSchema,
  WorkItemUpsertRequestSchema,
  WorkItemSchema
} from "@automomo/protocol";
import { apiKeyCan, tokenFromAuthorization } from "./auth/api-keys";
import { GitHubClient, normalizeGitHubWorkItem } from "./connectors/github/client";
import { verifyDaemonRequest } from "./daemon/auth";
import { parseRoomListQuery, parseSessionListQuery, parseWorkItemListQuery } from "./filters";
import { buildOverview } from "./overview";
import { redactSecrets } from "./security/redact";
import { InMemoryRateLimiter, RateLimitOptions } from "./security/rate-limit";
import { executeLocalRuntime } from "./runtime/execute";
import { applyHandoffAction, HandoffTransitionError } from "./sessions/handoff";
import { startSessionFromWorkItem } from "./sessions/start";
import { ControlPlaneStore, LeaseError, createDefaultStore } from "./store";

export interface AppEnv {
  store?: ControlPlaneStore;
  now?: () => Date;
  githubFetch?: typeof fetch;
  requireApiKey?: boolean;
  bootstrapToken?: string;
  githubWebhookSecret?: string;
  allowLocalExecution?: boolean;
  trustLocalExecutionWithoutAuth?: boolean;
  allowInsecureGitHubWebhooks?: boolean;
  rateLimit?: RateLimitOptions;
}

const createCodebaseBody = CodebaseSchema.partial({
  id: true,
  status: true,
  metadata: true,
  createdAt: true,
  updatedAt: true
});
const createWorkItemBody = WorkItemSchema.partial({
  id: true,
  body: true,
  source: true,
  status: true,
  priority: true,
  labels: true,
  metadata: true,
  createdAt: true,
  updatedAt: true
});
const patchWorkItemBody = createWorkItemBody
  .partial()
  .pick({ title: true, body: true, status: true, priority: true, labels: true, roomId: true, metadata: true });
const createRuleBody = OrchestrationRuleSchema.partial({
  id: true,
  enabled: true,
  match: true,
  humanApproval: true,
  createdAt: true,
  updatedAt: true
});
const createRoomBody = RoomSchema.partial({
  id: true,
  description: true,
  status: true,
  metadata: true,
  createdAt: true,
  updatedAt: true
});
const createRoomAgentBody = RoomAgentSchema.partial({
  id: true,
  roomId: true,
  metadata: true,
  createdAt: true,
  updatedAt: true
});
const createRoomMessageBody = RoomMessageSchema.partial({
  id: true,
  roomId: true,
  metadata: true,
  createdAt: true,
  updatedAt: true
});
const createRoomTaskBody = RoomTaskSchema.partial({
  id: true,
  roomId: true,
  body: true,
  status: true,
  assignedAgentId: true,
  workItemId: true,
  metadata: true,
  createdAt: true,
  updatedAt: true
});
const createSessionBody = SessionSchema.partial({
  id: true,
  codebaseId: true,
  roomId: true,
  status: true,
  participants: true,
  metadata: true,
  createdAt: true,
  updatedAt: true
});
const createRuntimeBody = RuntimeSchema.partial({
  id: true,
  environment: true,
  status: true,
  capacity: true,
  activeSessions: true,
  metadata: true,
  createdAt: true,
  updatedAt: true
});
const createAgentBody = AgentSchema.partial({
  id: true,
  instructions: true,
  skills: true,
  tools: true,
  maxConcurrency: true,
  metadata: true,
  createdAt: true,
  updatedAt: true
});

export function createApp(env: AppEnv = {}) {
  const app = new Hono();
  const store = env.store ?? createDefaultStore();
  const now = () => (env.now ?? (() => new Date()))().toISOString();
  const requireApiKey = env.requireApiKey ?? process.env.AUTOMOMO_REQUIRE_API_KEY === "true";
  const bootstrapToken = env.bootstrapToken ?? process.env.AUTOMOMO_BOOTSTRAP_TOKEN;
  const githubWebhookSecret = env.githubWebhookSecret ?? process.env.AUTOMOMO_GITHUB_WEBHOOK_SECRET;
  const allowLocalExecution = env.allowLocalExecution ?? process.env.AUTOMOMO_ENABLE_LOCAL_EXECUTION === "true";
  const trustLocalExecutionWithoutAuth =
    env.trustLocalExecutionWithoutAuth ?? process.env.AUTOMOMO_TRUST_LOCAL_EXECUTION_WITHOUT_AUTH === "true";
  const allowInsecureGitHubWebhooks =
    env.allowInsecureGitHubWebhooks ?? process.env.AUTOMOMO_ALLOW_INSECURE_GITHUB_WEBHOOKS === "true";
  const rateLimiter = new InMemoryRateLimiter(env.rateLimit ?? { limit: 120, windowMs: 60_000 });
  const github = new GitHubClient({ fetchImpl: env.githubFetch });

  app.get("/healthz", (c) => c.json({ ok: true, service: "automomo-api" }));

  app.get("/api/overview", (c) => c.json(buildOverview(store)));

  app.get("/api/codebases", (c) => c.json({ codebases: store.listCodebases() }));
  app.post("/api/codebases", async (c) => {
    const body = await parseJson(c.req, createCodebaseBody);
    const auth = await requireWriteAccess(c.req.raw.headers, "codebases:write", body.id, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const timestamp = now();
    const codebase = store.saveCodebase({
      id: body.id ?? randomId("codebase"),
      name: body.name,
      provider: body.provider,
      sourceUrl: body.sourceUrl,
      defaultBranch: body.defaultBranch,
      workspaceRoot: body.workspaceRoot,
      status: body.status ?? "active",
      metadata: body.metadata ?? {},
      createdAt: body.createdAt ?? timestamp,
      updatedAt: body.updatedAt ?? timestamp
    });
    return c.json({ codebase }, 201);
  });

  app.get("/api/work-items", (c) => {
    const query = parseWorkItemListQuery(c.req.url);
    const response = store.listWorkItems(query);
    return c.json({ ...response, workItems: response.items });
  });
  app.post("/api/work-items", async (c) => {
    const body = await parseJson(c.req, createWorkItemBody);
    const room = body.roomId ? store.getRoom(body.roomId) : undefined;
    if (body.roomId && !room) {
      return c.json({ error: "room not found" }, 404);
    }
    if (room && room.codebaseId !== body.codebaseId) {
      return c.json({ error: "room does not belong to work item codebase" }, 409);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "work_items:write", body.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const timestamp = now();
    let item = store.saveWorkItem({
      id: body.id ?? randomId("work"),
      codebaseId: body.codebaseId,
      roomId: body.roomId,
      title: body.title,
      body: body.body ?? "",
      source: body.source ?? "manual",
      status: body.status ?? "open",
      priority: body.priority ?? "medium",
      labels: body.labels ?? [],
      connector: body.connector,
      metadata: body.metadata ?? {},
      createdAt: body.createdAt ?? timestamp,
      updatedAt: body.updatedAt ?? timestamp
    });
    const sessionStart = startSessionFromWorkItem({
      store,
      workItem: item,
      trigger: item.source === "webhook" ? "webhook" : item.source,
      now: timestamp,
      idFactory: randomId
    });
    if (sessionStart.workItem) {
      item = sessionStart.workItem;
    }
    audit(store, {
      actorType: auth.apiKey ? "api_key" : "system",
      actorId: auth.apiKey?.id,
      action: "work_item.upsert",
      targetType: "work_item",
      targetId: item.id,
      metadata: { source: item.source },
      createdAt: timestamp
    });
    return c.json({ workItem: item, sessionStart: sessionStart.session ? sessionStart : undefined }, 201);
  });
  app.patch("/api/work-items/:id", async (c) => {
    const current = store.getWorkItem(c.req.param("id"));
    if (!current) {
      return c.json({ error: "work item not found" }, 404);
    }
    const auth = await requireWriteAccess(
      c.req.raw.headers,
      "work_items:write",
      current.codebaseId,
      requireApiKey,
      store,
      bootstrapToken
    );
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const body = await parseJson(c.req, patchWorkItemBody);
    const room = body.roomId ? store.getRoom(body.roomId) : undefined;
    if (body.roomId && !room) {
      return c.json({ error: "room not found" }, 404);
    }
    if (room && room.codebaseId !== current.codebaseId) {
      return c.json({ error: "room does not belong to work item codebase" }, 409);
    }
    const timestamp = now();
    const workItem = store.saveWorkItem({
      ...current,
      title: body.title ?? current.title,
      body: body.body ?? current.body,
      status: body.status ?? current.status,
      priority: body.priority ?? current.priority,
      labels: body.labels ?? current.labels,
      roomId: body.roomId ?? current.roomId,
      metadata: body.metadata ?? current.metadata,
      createdAt: current.createdAt,
      updatedAt: timestamp
    });
    audit(store, {
      actorType: auth.apiKey ? "api_key" : "system",
      actorId: auth.apiKey?.id,
      action: "work_item.update",
      targetType: "work_item",
      targetId: workItem.id,
      metadata: { codebaseId: workItem.codebaseId, roomId: workItem.roomId },
      createdAt: timestamp
    });
    return c.json({ workItem });
  });
  app.post("/api/work-items/:id/start", async (c) => {
    const item = store.getWorkItem(c.req.param("id"));
    if (!item) {
      return c.json({ error: "work item not found" }, 404);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "sessions:write", item.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const body = await parseJson(c.req, z.object({ trigger: z.enum(["manual", "webhook", "schedule", "sync", "api"]).default("manual") }));
    const result = startSessionFromWorkItem({ store, workItem: item, trigger: body.trigger, now: now(), idFactory: randomId });
    return c.json(result);
  });

  app.get("/api/rooms", (c) => {
    const query = parseRoomListQuery(c.req.url);
    const response = store.listRooms(query);
    return c.json({ ...response, rooms: response.items });
  });
  app.post("/api/rooms", async (c) => {
    const body = await parseJson(c.req, createRoomBody);
    if (!store.listCodebases().some((codebase) => codebase.id === body.codebaseId)) {
      return c.json({ error: "codebase not found" }, 404);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "rooms:write", body.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const timestamp = now();
    const room = store.saveRoom({
      id: body.id ?? randomId("room"),
      codebaseId: body.codebaseId,
      name: body.name,
      description: body.description ?? "",
      status: body.status ?? "active",
      metadata: body.metadata ?? {},
      createdAt: body.createdAt ?? timestamp,
      updatedAt: body.updatedAt ?? timestamp
    });
    audit(store, {
      actorType: auth.apiKey ? "api_key" : "system",
      actorId: auth.apiKey?.id,
      action: "room.create",
      targetType: "room",
      targetId: room.id,
      metadata: { codebaseId: room.codebaseId },
      createdAt: timestamp
    });
    return c.json({ room }, 201);
  });
  app.get("/api/rooms/:id/agents", (c) => {
    const room = store.getRoom(c.req.param("id"));
    if (!room) {
      return c.json({ error: "room not found" }, 404);
    }
    const roomAgents = store.listRoomAgents(room.id);
    return c.json({
      roomAgents,
      items: roomAgents,
      page: { limit: roomAgents.length, offset: 0, total: roomAgents.length }
    });
  });
  app.post("/api/rooms/:id/agents", async (c) => {
    const room = store.getRoom(c.req.param("id"));
    if (!room) {
      return c.json({ error: "room not found" }, 404);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "rooms:write", room.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const body = await parseJson(c.req, createRoomAgentBody);
    const agent = store.getAgent(body.agentId);
    if (!agent) {
      return c.json({ error: "agent not found" }, 404);
    }
    const timestamp = now();
    const roomAgent = store.saveRoomAgent({
      id: body.id ?? randomId("room_agent"),
      roomId: room.id,
      agentId: body.agentId,
      metadata: body.metadata ?? {},
      createdAt: body.createdAt ?? timestamp,
      updatedAt: body.updatedAt ?? timestamp
    });
    audit(store, {
      actorType: auth.apiKey ? "api_key" : "system",
      actorId: auth.apiKey?.id,
      action: "room.agent.create",
      targetType: "room_agent",
      targetId: roomAgent.id,
      metadata: { roomId: room.id, agentId: roomAgent.agentId },
      createdAt: timestamp
    });
    return c.json({ roomAgent }, 201);
  });
  app.get("/api/rooms/:id/messages", (c) => {
    const room = store.getRoom(c.req.param("id"));
    if (!room) {
      return c.json({ error: "room not found" }, 404);
    }
    const roomMessages = store.listRoomMessages(room.id);
    return c.json({
      roomMessages,
      items: roomMessages,
      page: { limit: roomMessages.length, offset: 0, total: roomMessages.length }
    });
  });
  app.post("/api/rooms/:id/messages", async (c) => {
    const room = store.getRoom(c.req.param("id"));
    if (!room) {
      return c.json({ error: "room not found" }, 404);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "rooms:write", room.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const body = await parseJson(c.req, createRoomMessageBody);
    if (body.author.type === "agent" && !store.getAgent(body.author.agentId)) {
      return c.json({ error: "agent not found" }, 404);
    }
    const timestamp = now();
    const roomMessage = store.saveRoomMessage({
      id: body.id ?? randomId("room_message"),
      roomId: room.id,
      author: body.author,
      body: body.body,
      metadata: body.metadata ?? {},
      createdAt: body.createdAt ?? timestamp,
      updatedAt: body.updatedAt ?? timestamp
    });
    audit(store, {
      actorType: body.author.type === "system" ? "system" : body.author.type === "human" ? "human" : "system",
      actorId: body.author.type === "agent" ? body.author.agentId : undefined,
      action: "room.message.create",
      targetType: "room_message",
      targetId: roomMessage.id,
      metadata: { roomId: room.id },
      createdAt: timestamp
    });
    return c.json({ roomMessage }, 201);
  });
  app.get("/api/rooms/:id/tasks", (c) => {
    const room = store.getRoom(c.req.param("id"));
    if (!room) {
      return c.json({ error: "room not found" }, 404);
    }
    const roomTasks = store.listRoomTasks(room.id);
    return c.json({
      roomTasks,
      items: roomTasks,
      page: { limit: roomTasks.length, offset: 0, total: roomTasks.length }
    });
  });
  app.post("/api/rooms/:id/tasks", async (c) => {
    const room = store.getRoom(c.req.param("id"));
    if (!room) {
      return c.json({ error: "room not found" }, 404);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "rooms:write", room.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const body = await parseJson(c.req, createRoomTaskBody);
    if (body.assignedAgentId && !store.getAgent(body.assignedAgentId)) {
      return c.json({ error: "agent not found" }, 404);
    }
    if (body.workItemId) {
      const workItem = store.getWorkItem(body.workItemId);
      if (!workItem) {
        return c.json({ error: "work item not found" }, 404);
      }
      if (workItem.codebaseId !== room.codebaseId) {
        return c.json({ error: "work item does not belong to room codebase" }, 409);
      }
      if (workItem.roomId !== room.id) {
        return c.json({ error: "work item does not belong to room" }, 409);
      }
    }
    const timestamp = now();
    const roomTask = store.saveRoomTask({
      id: body.id ?? randomId("room_task"),
      roomId: room.id,
      title: body.title,
      body: body.body ?? "",
      status: body.status ?? "open",
      assignedAgentId: body.assignedAgentId,
      workItemId: body.workItemId,
      metadata: body.metadata ?? {},
      createdAt: body.createdAt ?? timestamp,
      updatedAt: body.updatedAt ?? timestamp
    });
    audit(store, {
      actorType: auth.apiKey ? "api_key" : "system",
      actorId: auth.apiKey?.id,
      action: "room.task.create",
      targetType: "room_task",
      targetId: roomTask.id,
      metadata: { roomId: room.id, workItemId: roomTask.workItemId, assignedAgentId: roomTask.assignedAgentId },
      createdAt: timestamp
    });
    return c.json({ roomTask }, 201);
  });
  app.get("/api/rooms/:id/work-items", (c) => {
    const room = store.getRoom(c.req.param("id"));
    if (!room) {
      return c.json({ error: "room not found" }, 404);
    }
    const response = store.listWorkItems({
      codebaseId: room.codebaseId,
      roomId: room.id,
      limit: 50,
      offset: 0
    });
    return c.json({ ...response, workItems: response.items });
  });
  app.post("/api/rooms/:id/work-items", async (c) => {
    const room = store.getRoom(c.req.param("id"));
    if (!room) {
      return c.json({ error: "room not found" }, 404);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "work_items:write", room.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const body = await parseJson(c.req, createWorkItemBody.partial({ codebaseId: true, roomId: true }));
    if (body.codebaseId && body.codebaseId !== room.codebaseId) {
      return c.json({ error: "work item codebase does not match room codebase" }, 409);
    }
    const timestamp = now();
    const item = store.saveWorkItem({
      id: body.id ?? randomId("work"),
      codebaseId: room.codebaseId,
      roomId: room.id,
      title: body.title,
      body: body.body ?? "",
      source: body.source ?? "manual",
      status: body.status ?? "open",
      priority: body.priority ?? "medium",
      labels: body.labels ?? [],
      connector: body.connector,
      metadata: body.metadata ?? {},
      createdAt: body.createdAt ?? timestamp,
      updatedAt: body.updatedAt ?? timestamp
    });
    audit(store, {
      actorType: auth.apiKey ? "api_key" : "system",
      actorId: auth.apiKey?.id,
      action: "room.work_item.create",
      targetType: "work_item",
      targetId: item.id,
      metadata: { roomId: room.id },
      createdAt: timestamp
    });
    return c.json({ workItem: item }, 201);
  });

  app.get("/api/orchestration-rules", (c) => c.json({ orchestrationRules: store.listOrchestrationRules() }));
  app.post("/api/orchestration-rules", async (c) => {
    const body = await parseJson(c.req, createRuleBody);
    const auth = await requireWriteAccess(c.req.raw.headers, "rules:write", body.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const timestamp = now();
    const rule = store.saveOrchestrationRule({
      id: body.id ?? randomId("rule"),
      codebaseId: body.codebaseId,
      name: body.name,
      enabled: body.enabled ?? true,
      trigger: body.trigger,
      match: body.match ?? {},
      agentId: body.agentId,
      runtimeId: body.runtimeId,
      humanApproval: body.humanApproval ?? "on_risk",
      createdAt: body.createdAt ?? timestamp,
      updatedAt: body.updatedAt ?? timestamp
    });
    return c.json({ orchestrationRule: rule }, 201);
  });

  app.get("/api/sessions", (c) => {
    const query = parseSessionListQuery(c.req.url);
    const response = store.listSessions(query);
    return c.json({ ...response, sessions: response.items });
  });
  app.post("/api/sessions", async (c) => {
    const body = await parseJson(c.req, createSessionBody);
    const room = body.roomId ? store.getRoom(body.roomId) : undefined;
    if (body.roomId && !room) {
      return c.json({ error: "room not found" }, 404);
    }
    const codebaseId = body.codebaseId ?? room?.codebaseId;
    if (!codebaseId) {
      return c.json({ error: "codebaseId or roomId required" }, 400);
    }
    if (room && room.codebaseId !== codebaseId) {
      return c.json({ error: "room does not belong to codebase" }, 409);
    }
    const workItem = body.workItemId ? store.getWorkItem(body.workItemId) : undefined;
    if (body.workItemId) {
      if (!workItem) {
        return c.json({ error: "work item not found" }, 404);
      }
      if (workItem.codebaseId !== codebaseId) {
        return c.json({ error: "work item does not belong to session codebase" }, 409);
      }
      if (workItem.roomId && body.roomId && workItem.roomId !== body.roomId) {
        return c.json({ error: "work item room does not match session room" }, 409);
      }
    }
    const requestedRuntime = body.runtimeId ? store.getRuntime(body.runtimeId) : undefined;
    const sessionRequiresAuth =
      requireApiKey || (allowLocalExecution && !trustLocalExecutionWithoutAuth && requestedRuntime?.mode === "local");
    const auth = await requireWriteAccess(c.req.raw.headers, "sessions:write", codebaseId, sessionRequiresAuth, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const timestamp = now();
    const session = store.saveSession({
      id: body.id ?? randomId("session"),
      codebaseId,
      roomId: body.roomId ?? workItem?.roomId ?? room?.id,
      workItemId: body.workItemId,
      agentId: body.agentId,
      runtimeId: body.runtimeId,
      status: body.status ?? "queued",
      participants: body.participants ?? [],
      leaseId: body.leaseId,
      outcomeId: body.outcomeId,
      metadata: body.metadata ?? {},
      createdAt: body.createdAt ?? timestamp,
      startedAt: body.startedAt,
      completedAt: body.completedAt,
      updatedAt: body.updatedAt ?? timestamp
    });
    return c.json({ session }, 201);
  });

  app.get("/api/sessions/:id", (c) => {
    const sessionId = c.req.param("id");
    const session = store.getSession(sessionId);
    if (!session) {
      return c.json({ error: "session not found" }, 404);
    }
    return c.json({
      session,
      events: store.listSessionEvents(sessionId),
      handoffs: store.listHandoffs(sessionId),
      outcome: session.outcomeId ? store.getOutcome(session.outcomeId) : store.getOutcomeForSession(sessionId),
      workItem: session.workItemId ? store.getWorkItem(session.workItemId) : undefined,
      agent: session.agentId ? store.getAgent(session.agentId) : undefined,
      runtime: session.runtimeId ? store.getRuntime(session.runtimeId) : undefined,
      room: session.roomId ? store.getRoom(session.roomId) : undefined
    });
  });
  app.get("/api/sessions/:id/events", (c) => c.json({ events: store.listSessionEvents(c.req.param("id")) }));
  app.post("/api/sessions/:id/events", async (c) => {
    const sessionId = c.req.param("id");
    const session = store.getSession(sessionId);
    if (!session) {
      return c.json({ error: "session not found" }, 404);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "sessions:write", session.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const body = await parseJson(c.req, z.object({ events: z.array(SessionEventSchema).min(1) }));
    const runtime = session.runtimeId ? store.getRuntime(session.runtimeId) : undefined;
    const secretRefs = runtime?.environment.secretRefs ?? [];
    const baseSequence = store.listSessionEvents(sessionId).length;
    const events = store.appendSessionEvents(
      sessionId,
      body.events.map((event, index) => redactSecrets({ ...event, sequence: baseSequence + index }, secretRefs))
    );
    return c.json({ events }, 201);
  });
  app.post("/api/sessions/:id/handoff", async (c) => {
    const sessionId = c.req.param("id");
    const session = store.getSession(sessionId);
    if (!session) {
      return c.json({ error: "session not found" }, 404);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "handoffs:write", session.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const legacyBody = await c.req.json();
    const body = HandoffActionSchema.parse(
      "action" in Object(legacyBody)
        ? legacyBody
        : { action: "request", reason: (legacyBody as { reason?: string }).reason, note: (legacyBody as { note?: string }).note ?? "", claimedBy: (legacyBody as { claimedBy?: string }).claimedBy }
    );
    const timestamp = now();
    const result = tryHandoff({ store, sessionId, action: body, now: timestamp });
    if (!result) {
      return c.json({ error: "session not found" }, 404);
    }
    if ("error" in result) {
      return c.json({ error: result.error }, 409);
    }
    return c.json({ handoff: result.handoff, session: result.session }, 201);
  });
  app.post("/api/sessions/:id/resume", async (c) => {
    const session = store.getSession(c.req.param("id"));
    if (!session) {
      return c.json({ error: "session not found" }, 404);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "handoffs:write", session.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const body = await parseJson(c.req, HandoffActionSchema.partial({ action: true, reason: true, metadata: true }));
    const result = tryHandoff({
      store,
      sessionId: c.req.param("id"),
      action: HandoffActionSchema.parse({ action: "resume", reason: body.reason, note: body.note, claimedBy: body.claimedBy, metadata: body.metadata ?? {} }),
      now: now()
    });
    return handoffResponse(c, result, 200);
  });
  app.post("/api/sessions/:id/approve", async (c) => {
    const session = store.getSession(c.req.param("id"));
    if (!session) {
      return c.json({ error: "session not found" }, 404);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "handoffs:write", session.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const body = await parseJson(c.req, HandoffActionSchema.partial({ action: true, reason: true, metadata: true }));
    const result = tryHandoff({
      store,
      sessionId: c.req.param("id"),
      action: HandoffActionSchema.parse({ action: "approve", reason: body.reason, note: body.note, claimedBy: body.claimedBy, metadata: body.metadata ?? {} }),
      now: now()
    });
    return handoffResponse(c, result, 200);
  });
  app.post("/api/sessions/:id/reject", async (c) => {
    const session = store.getSession(c.req.param("id"));
    if (!session) {
      return c.json({ error: "session not found" }, 404);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "handoffs:write", session.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const body = await parseJson(c.req, HandoffActionSchema.partial({ action: true, reason: true, metadata: true }));
    const result = tryHandoff({
      store,
      sessionId: c.req.param("id"),
      action: HandoffActionSchema.parse({ action: "reject", reason: body.reason, note: body.note, claimedBy: body.claimedBy, metadata: body.metadata ?? {} }),
      now: now()
    });
    return handoffResponse(c, result, 200);
  });
  app.post("/api/sessions/:id/outcome", async (c) => {
    const sessionId = c.req.param("id");
    const session = store.getSession(sessionId);
    if (!session) {
      return c.json({ error: "session not found" }, 404);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "sessions:write", session.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const body = await parseJson(
      c.req,
      z.object({
        id: z.string().optional(),
        status: z.enum(["success", "failed", "needs_human"]),
        summary: z.string().min(1),
        result: z.record(z.string(), z.unknown()).default({})
      })
    );
    const timestamp = now();
    const runtime = session.runtimeId ? store.getRuntime(session.runtimeId) : undefined;
    const outcome = store.saveOutcome(
      redactForRuntime(
        {
          id: body.id ?? randomId("outcome"),
          sessionId,
          status: body.status,
          summary: body.summary,
          result: body.result,
          eventsUploaded: store.listSessionEvents(sessionId).length,
          createdAt: timestamp
        },
        runtime
      )
    );
    return c.json({ outcome, session: store.getSession(sessionId) }, 201);
  });
  app.post("/api/sessions/:id/run-local", async (c) => {
    const session = store.getSession(c.req.param("id"));
    if (!session) {
      return c.json({ error: "session not found" }, 404);
    }
    const auth = await requireWriteAccess(
      c.req.raw.headers,
      "runtime:execute",
      session.codebaseId,
      requireApiKey || !trustLocalExecutionWithoutAuth,
      store,
      bootstrapToken
    );
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    if (!allowLocalExecution) {
      return c.json({ error: "local runtime execution is disabled" }, 403);
    }
    const body = await parseJson(c.req, RuntimeExecutionRequestSchema.partial({ sessionId: true }));
    try {
      const result = await executeLocalRuntime({
        store,
        sessionId: c.req.param("id"),
        request: RuntimeExecutionRequestSchema.parse({ ...body, sessionId: c.req.param("id") }),
        now: now()
      });
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "local runtime failed" }, 409);
    }
  });

  app.get("/api/agents", (c) => c.json({ agents: store.listAgents() }));
  app.post("/api/agents", async (c) => {
    const body = await parseJson(c.req, createAgentBody);
    const auth = await requireWriteAccess(c.req.raw.headers, "agents:write", undefined, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const timestamp = now();
    const agent = store.saveAgent({
      id: body.id ?? randomId("agent"),
      name: body.name,
      model: body.model,
      instructions: body.instructions ?? "",
      skills: body.skills ?? [],
      tools: body.tools ?? [],
      defaultRuntimeId: body.defaultRuntimeId,
      maxConcurrency: body.maxConcurrency ?? 1,
      metadata: body.metadata ?? {},
      createdAt: body.createdAt ?? timestamp,
      updatedAt: body.updatedAt ?? timestamp
    });
    return c.json({ agent }, 201);
  });

  app.get("/api/runtimes", (c) => c.json({ runtimes: store.listRuntimes() }));
  app.post("/api/runtimes", async (c) => {
    const body = await parseJson(c.req, createRuntimeBody);
    const runtimeRequiresAuth = requireApiKey || (allowLocalExecution && !trustLocalExecutionWithoutAuth && body.mode === "local");
    const auth = await requireWriteAccess(c.req.raw.headers, "runtimes:write", undefined, runtimeRequiresAuth, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const timestamp = now();
    const runtime = store.saveRuntime({
      id: body.id ?? randomId("runtime"),
      name: body.name,
      mode: body.mode,
      provider: body.provider,
      environment: body.environment ?? { networkPolicy: "restricted", env: {}, secretRefs: [] },
      status: body.status ?? "offline",
      capacity: body.capacity ?? 1,
      activeSessions: body.activeSessions ?? 0,
      lastHeartbeatAt: body.lastHeartbeatAt,
      metadata: body.metadata ?? {},
      createdAt: body.createdAt ?? timestamp,
      updatedAt: body.updatedAt ?? timestamp
    });
    return c.json({ runtime }, 201);
  });

  app.post("/api/daemon/register", async (c) => {
    const body = await parseJson(c.req, DaemonRegistrationSchema);
    const timestamp = now();
    const existing = body.runtimeId ? store.getRuntime(body.runtimeId) : undefined;
    const auth = await requireWriteAccess(c.req.raw.headers, "daemons:register", undefined, requireApiKey || Boolean(existing), store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    if (existing && !auth.bootstrap && (!auth.apiKey || !apiKeyCan(auth.apiKey, "runtimes:write"))) {
      return c.json({ error: "existing runtime daemon binding requires runtimes:write" }, 403);
    }
    const secret = randomSecret();
    const daemonId = body.daemonId ?? randomId("daemon");
    const runtime = store.saveRuntime({
      id: existing?.id ?? body.runtimeId ?? randomId("runtime"),
      name: body.name,
      mode: "remote_daemon",
      provider: body.provider,
      environment: body.environment,
      status: "online",
      capacity: existing?.capacity ?? 1,
      activeSessions: existing?.activeSessions ?? 0,
      lastHeartbeatAt: timestamp,
      metadata: existing?.metadata ?? {},
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    });
    const daemon = store.saveDaemon({
      id: daemonId,
      runtimeId: runtime.id,
      name: body.name,
      secretId: randomId("secret"),
      secret,
      signatureVersion: "hmac-sha256-v1",
      status: "online",
      lastSeenAt: timestamp,
      metadata: {},
      createdAt: timestamp,
      updatedAt: timestamp
    });
    audit(store, {
      actorType: "daemon",
      actorId: daemon.id,
      action: "daemon.register",
      targetType: "runtime",
      targetId: runtime.id,
      metadata: {},
      createdAt: timestamp
    });
    return c.json(DaemonRegistrationResponseSchema.parse({ daemon, runtime, secret }), existing ? 200 : 201);
  });

  app.post("/api/daemon/heartbeat", async (c) => {
    const signed = await parseSignedJson(c, RuntimeHeartbeatSchema, store, now());
    if (!signed.ok) return c.json({ error: signed.error }, signed.status);
    const body = signed.body;
    const existing = store.getRuntime(body.runtimeId);
    if (!existing) {
      return c.json({ error: "runtime not found" }, 404);
    }
    const runtime = store.saveRuntime({
      ...existing,
      status: body.status,
      activeSessions: body.activeSessions,
      capacity: body.capacity,
      lastHeartbeatAt: body.observedAt,
      updatedAt: now()
    });
    return c.json({ runtime });
  });

  app.post("/api/daemon/lease", async (c) => {
    const limited = limitRequest(c.req.raw.headers, "daemon", rateLimiter);
    if (!limited.ok) return c.json({ error: "rate limit exceeded" }, 429);
    const signed = await parseSignedJson(c, LeaseRequestSchema, store, now());
    if (!signed.ok) return c.json({ error: signed.error }, signed.status);
    const body = signed.body;
    const runtime = store.getRuntime(body.runtimeId);
    if (!runtime) {
      return c.json({ error: "runtime not found" }, 404);
    }
    const session = store.nextQueuedSession(body.runtimeId);
    if (!session) {
      return c.json({ lease: null });
    }
    const timestamp = now();
    const lease = store.createLease({
      id: randomId("lease"),
      runtimeId: body.runtimeId,
      sessionId: session.id,
      daemonId: signed.daemon.id,
      createdAt: timestamp,
      expiresAt: new Date(Date.parse(timestamp) + 5 * 60 * 1000).toISOString()
    });
    const updatedSession = store.getSession(session.id) ?? session;
    return c.json({
      lease: {
        leaseId: lease.id,
        session: updatedSession,
        workItem: updatedSession.workItemId ? store.getWorkItem(updatedSession.workItemId) : undefined,
        agent: updatedSession.agentId ? store.getAgent(updatedSession.agentId) : undefined,
        runtime,
        expiresAt: lease.expiresAt
      }
    });
  });

  app.post("/api/daemon/lease/renew", async (c) => {
    const signed = await parseSignedJson(c, LeaseRenewRequestSchema, store, now());
    if (!signed.ok) return c.json({ error: signed.error }, signed.status);
    const timestamp = now();
    const lease = store.renewLease({ leaseId: signed.body.leaseId, runtimeId: signed.body.runtimeId, now: timestamp, daemonId: signed.daemon.id });
    if (!lease) {
      return c.json({ error: "lease not found or not owned by daemon" }, 409);
    }
    audit(store, {
      actorType: "daemon",
      actorId: signed.daemon.id,
      action: "lease.renew",
      targetType: "lease",
      targetId: lease.id,
      metadata: {},
      createdAt: lease.renewedAt ?? timestamp
    });
    return c.json({ lease });
  });

  app.post("/api/daemon/events", async (c) => {
    const signed = await parseSignedJson(c, LeaseEventUploadSchema, store, now());
    if (!signed.ok) return c.json({ error: signed.error }, signed.status);
    const body = signed.body;
    try {
      store.assertLease({ leaseId: body.leaseId, runtimeId: body.runtimeId, sessionId: body.sessionId, now: now(), daemonId: signed.daemon.id });
    } catch (err) {
      if (err instanceof LeaseError) {
        return c.json({ error: err.message }, 409);
      }
      throw err;
    }
    const runtime = store.getRuntime(body.runtimeId);
    const events = store.appendSessionEvents(
      body.sessionId,
      body.events.map((event) => redactEventForRuntime(event, runtime))
    );
    store.updateSession(body.sessionId, { status: "running", updatedAt: now() });
    return c.json({ events });
  });

  app.post("/api/daemon/outcome", async (c) => {
    const signed = await parseSignedJson(c, LeaseOutcomeUploadSchema, store, now());
    if (!signed.ok) return c.json({ error: signed.error }, signed.status);
    const body = signed.body;
    try {
      store.assertLease({ leaseId: body.leaseId, runtimeId: body.runtimeId, sessionId: body.sessionId, now: now(), daemonId: signed.daemon.id });
    } catch (err) {
      if (err instanceof LeaseError) {
        return c.json({ error: err.message }, 409);
      }
      throw err;
    }
    const runtime = store.getRuntime(body.runtimeId);
    const outcome = store.saveOutcome(redactForRuntime(body.outcome, runtime));
    store.completeLease({ leaseId: body.leaseId, now: now() });
    return c.json({ outcome, session: store.getSession(body.sessionId) });
  });

  app.post("/api/daemon/fail", async (c) => {
    const signed = await parseSignedJson(c, LeaseFailureUploadSchema, store, now());
    if (!signed.ok) return c.json({ error: signed.error }, signed.status);
    const lease = store.failLease({
      leaseId: signed.body.leaseId,
      runtimeId: signed.body.runtimeId,
      sessionId: signed.body.sessionId,
      now: now(),
      daemonId: signed.daemon.id
    });
    if (!lease) {
      return c.json({ error: "lease not found or not owned by daemon" }, 409);
    }
    const runtime = store.getRuntime(signed.body.runtimeId);
    store.appendSessionEvents(signed.body.sessionId, [
      redactEventForRuntime(
        {
          id: randomId("event"),
          sessionId: signed.body.sessionId,
          sequence: store.listSessionEvents(signed.body.sessionId).length,
          kind: "failure",
          summary: signed.body.reason,
          detail: signed.body.detail,
          metadata: signed.body.metadata,
          createdAt: now()
        },
        runtime
      )
    ]);
    audit(store, {
      actorType: "daemon",
      actorId: signed.daemon.id,
      action: "lease.fail",
      targetType: "lease",
      targetId: lease.id,
      metadata: redactForRuntime({ reason: signed.body.reason }, runtime),
      createdAt: now()
    });
    return c.json({ lease, session: store.getSession(signed.body.sessionId) });
  });

  app.post("/api/webhooks/github", async (c) => {
    const limited = limitRequest(c.req.raw.headers, "github", rateLimiter);
    if (!limited.ok) return c.json({ error: "rate limit exceeded" }, 429);
    const event = c.req.header("x-github-event");
    if (event !== "issues" && event !== "pull_request") {
      return c.json({ error: "unsupported GitHub event" }, 202);
    }
    const bodyText = await c.req.text();
    if (githubWebhookSecret) {
      if (!verifyGitHubSignature(bodyText, githubWebhookSecret, c.req.raw.headers.get("x-hub-signature-256"))) {
        return c.json({ error: "invalid GitHub webhook signature" }, 401);
      }
    } else if (!allowInsecureGitHubWebhooks) {
      const auth = await requireWriteAccess(c.req.raw.headers, "webhooks:write", undefined, true, store, bootstrapToken);
      if (!auth.ok) {
        return c.json({ error: auth.error }, auth.status);
      }
    }
    const payload = JSON.parse(bodyText);
    const repository = payload.repository;
    const owner = repository?.owner?.login;
    const repo = repository?.name;
    const number = event === "issues" ? payload.issue?.number : payload.pull_request?.number;
    if (!owner || !repo || typeof number !== "number") {
      return c.json({ error: "invalid GitHub webhook payload" }, 400);
    }
    const codebase = findGitHubCodebase(store, owner, repo);
    if (!codebase) {
      return c.json({ error: `unknown GitHub repository ${owner}/${repo}` }, 400);
    }
    try {
      const fresh =
        event === "issues"
          ? await github.fetchIssue({ owner, repo, number })
          : await github.fetchPullRequest({ owner, repo, number });
      const request = WorkItemUpsertRequestSchema.parse(
        normalizeGitHubWorkItem({ event, owner, repo, number, codebaseId: codebase.id, payload: fresh })
      );
      const { upsertWorkItemFromSource } = await import("./work-items/upsert");
      const result = upsertWorkItemFromSource({ store, request, now: now(), idFactory: randomId });
      audit(store, {
        actorType: "connector",
        actorId: "github",
        action: "work_item.upsert",
        targetType: "work_item",
        targetId: result.workItem.id,
        metadata: { event },
        createdAt: now()
      });
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "GitHub webhook failed" }, 400);
    }
  });

  app.post("/api/api-keys", async (c) => {
    const body = await c.req.json();
    const auth = await requireWriteAccess(c.req.raw.headers, "api_keys:write", undefined, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const timestamp = now();
    const token = body.token ?? randomSecret();
    const apiKey = store.createApiKey({
      id: body.id ?? randomId("key"),
      name: body.name,
      token,
      scopes: body.scopes ?? [],
      metadata: body.metadata ?? {},
      createdAt: body.createdAt ?? timestamp,
      updatedAt: body.updatedAt ?? timestamp
    });
    return c.json({ apiKey, token }, 201);
  });

  app.onError((err, c) => {
    if (err instanceof z.ZodError) {
      return c.json({ error: "invalid request body", issues: err.issues }, 400);
    }
    if (err instanceof SyntaxError) {
      return c.json({ error: "invalid JSON" }, 400);
    }
    console.error(err);
    return c.json({ error: "internal server error" }, 500);
  });

  return app;
}

async function parseJson<T extends z.ZodTypeAny>(req: { json: () => Promise<unknown> }, schema: T): Promise<z.infer<T>> {
  return schema.parse(await req.json());
}

async function parseSignedJson<T extends z.ZodTypeAny>(
  c: any,
  schema: T,
  store: ControlPlaneStore,
  timestamp: string
): Promise<
  | { ok: true; body: z.infer<T>; daemon: NonNullable<ReturnType<ControlPlaneStore["getDaemon"]>>; timestamp: string }
  | { ok: false; status: 401 | 403; error: string }
> {
  const bodyText = await c.req.text();
  const path = new URL(c.req.url).pathname;
  const verification = verifyDaemonRequest({
    store,
    method: c.req.raw.method,
    path,
    headers: c.req.raw.headers,
    bodyText,
    now: timestamp
  });
  if (!verification.ok) {
    return { ok: false, status: verification.status as 401 | 403, error: verification.error };
  }
  return { ok: true, body: schema.parse(JSON.parse(bodyText)), daemon: verification.daemon, timestamp: c.req.raw.headers.get("x-automomo-timestamp") ?? timestamp };
}

function tryHandoff(input: {
  store: ControlPlaneStore;
  sessionId: string;
  action: z.infer<typeof HandoffActionSchema>;
  now: string;
}) {
  try {
    return applyHandoffAction({ ...input, idFactory: randomId });
  } catch (err) {
    if (err instanceof HandoffTransitionError) {
      return { error: err.message };
    }
    throw err;
  }
}

function handoffResponse(c: any, result: ReturnType<typeof tryHandoff>, successStatus: 200 | 201) {
  if (!result) {
    return c.json({ error: "session not found" }, 404);
  }
  if ("error" in result) {
    return c.json({ error: result.error }, 409);
  }
  return c.json({ handoff: result.handoff, session: result.session }, successStatus);
}

type RuntimeRecord = NonNullable<ReturnType<ControlPlaneStore["getRuntime"]>>;

function redactForRuntime<T>(value: T, runtime: RuntimeRecord | undefined): T {
  return redactSecrets(value, runtime?.environment.secretRefs ?? [], runtime ? runtimeSecretValues(runtime) : []);
}

function redactEventForRuntime<T extends { summary: string; detail?: string }>(event: T, runtime: RuntimeRecord | undefined): T {
  const redacted = redactForRuntime(event, runtime);
  if (typeof redacted.detail !== "string" || redacted.detail === event.detail) {
    return redacted;
  }
  const summary = redacted.detail.trim().slice(0, 180);
  return { ...redacted, summary: summary || redacted.summary };
}

function runtimeSecretValues(runtime: RuntimeRecord) {
  const refs = new Set(runtime.environment.secretRefs.map((item) => item.toLowerCase()));
  return Object.entries(runtime.environment.env)
    .filter(([key]) => refs.has(key.toLowerCase()))
    .map(([, value]) => value);
}

async function requireWriteAccess(
  headers: Headers,
  action: string,
  codebaseId: string | undefined,
  required: boolean,
  store: ControlPlaneStore,
  bootstrapToken?: string
): Promise<
  | { ok: true; apiKey?: ReturnType<ControlPlaneStore["findApiKeyByToken"]>; bootstrap?: boolean }
  | { ok: false; status: 401 | 403; error: string }
> {
  if (!required) {
    return { ok: true };
  }
  const token = tokenFromAuthorization(headers.get("authorization"));
  if (!token) {
    return { ok: false, status: 401, error: "missing API key" };
  }
  if (bootstrapToken && token === bootstrapToken) {
    return { ok: true, bootstrap: true };
  }
  const apiKey = store.findApiKeyByToken(token);
  if (!apiKey) {
    return { ok: false, status: 401, error: "invalid API key" };
  }
  if (!apiKeyCan(apiKey, action, codebaseId)) {
    return { ok: false, status: 403, error: "API key scope denied" };
  }
  return { ok: true, apiKey };
}

function verifyGitHubSignature(bodyText: string, secret: string, header: string | null) {
  if (!header?.startsWith("sha256=")) {
    return false;
  }
  const expected = `sha256=${createHmac("sha256", secret).update(bodyText).digest("hex")}`;
  return safeHeaderEqual(expected, header);
}

function safeHeaderEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function findGitHubCodebase(store: ControlPlaneStore, owner: string, repo: string) {
  const expected = `${owner}/${repo}`.toLowerCase();
  return store.listCodebases().find((codebase) => {
    if (codebase.provider !== "github") {
      return false;
    }
    return codebase.id.toLowerCase() === expected || normalizeGitHubRepo(codebase.sourceUrl) === expected;
  });
}

function normalizeGitHubRepo(sourceUrl: string | undefined) {
  if (!sourceUrl) {
    return undefined;
  }
  try {
    const url = new URL(sourceUrl);
    if (url.hostname !== "github.com") {
      return undefined;
    }
    return url.pathname.replace(/^\/+/, "").replace(/\.git$/, "").toLowerCase();
  } catch {
    return undefined;
  }
}

function audit(
  store: ControlPlaneStore,
  event: Omit<Parameters<ControlPlaneStore["appendAuditEvent"]>[0], "id"> & { id?: string }
) {
  store.appendAuditEvent({ ...event, id: event.id ?? randomId("audit"), metadata: redactSecrets(event.metadata) });
}

function limitRequest(headers: Headers, namespace: string, rateLimiter: InMemoryRateLimiter) {
  const source = headers.get("x-forwarded-for") ?? headers.get("x-real-ip") ?? "local";
  const daemonId = headers.get("x-automomo-daemon-id") ?? headers.get("x-github-delivery") ?? "anonymous";
  return rateLimiter.check(`${namespace}:${source}:${daemonId}`);
}

function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function randomSecret() {
  return crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
}
