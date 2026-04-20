import { Hono } from "hono";
import { z } from "zod";
import {
  AgentSchema,
  CodebaseSchema,
  DaemonRegistrationSchema,
  HumanHandoffSchema,
  LeaseEventUploadSchema,
  LeaseOutcomeUploadSchema,
  LeaseRequestSchema,
  OrchestrationRuleSchema,
  RuntimeHeartbeatSchema,
  RuntimeSchema,
  SessionSchema,
  WorkItemSchema
} from "@automomo/protocol";
import { ControlPlaneStore, LeaseError, createDefaultStore } from "./store";

export interface AppEnv {
  store?: ControlPlaneStore;
  now?: () => Date;
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
const createRuleBody = OrchestrationRuleSchema.partial({
  id: true,
  enabled: true,
  match: true,
  humanApproval: true,
  createdAt: true,
  updatedAt: true
});
const createSessionBody = SessionSchema.partial({
  id: true,
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

  app.get("/healthz", (c) => c.json({ ok: true, service: "automomo-api" }));

  app.get("/api/codebases", (c) => c.json({ codebases: store.listCodebases() }));
  app.post("/api/codebases", async (c) => {
    const body = await parseJson(c.req, createCodebaseBody);
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

  app.get("/api/work-items", (c) => c.json({ workItems: store.listWorkItems() }));
  app.post("/api/work-items", async (c) => {
    const body = await parseJson(c.req, createWorkItemBody);
    const timestamp = now();
    const item = store.saveWorkItem({
      id: body.id ?? randomId("work"),
      codebaseId: body.codebaseId,
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
    return c.json({ workItem: item }, 201);
  });

  app.get("/api/orchestration-rules", (c) => c.json({ orchestrationRules: store.listOrchestrationRules() }));
  app.post("/api/orchestration-rules", async (c) => {
    const body = await parseJson(c.req, createRuleBody);
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

  app.get("/api/sessions", (c) => c.json({ sessions: store.listSessions() }));
  app.post("/api/sessions", async (c) => {
    const body = await parseJson(c.req, createSessionBody);
    const timestamp = now();
    const session = store.saveSession({
      id: body.id ?? randomId("session"),
      codebaseId: body.codebaseId,
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

  app.get("/api/sessions/:id/events", (c) => c.json({ events: store.listSessionEvents(c.req.param("id")) }));
  app.post("/api/sessions/:id/handoff", async (c) => {
    const sessionId = c.req.param("id");
    if (!store.getSession(sessionId)) {
      return c.json({ error: "session not found" }, 404);
    }
    const body = await parseJson(
      c.req,
      HumanHandoffSchema.partial({ id: true, sessionId: true, status: true, note: true, createdAt: true, updatedAt: true })
    );
    const timestamp = now();
    const handoff = store.saveHandoff({
      id: body.id ?? randomId("handoff"),
      sessionId,
      status: body.status ?? "requested",
      reason: body.reason,
      note: body.note ?? "",
      claimedBy: body.claimedBy,
      createdAt: body.createdAt ?? timestamp,
      updatedAt: body.updatedAt ?? timestamp
    });
    return c.json({ handoff, session: store.getSession(sessionId) }, 201);
  });

  app.get("/api/agents", (c) => c.json({ agents: store.listAgents() }));
  app.post("/api/agents", async (c) => {
    const body = await parseJson(c.req, createAgentBody);
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
    return c.json({ runtime }, existing ? 200 : 201);
  });

  app.post("/api/daemon/heartbeat", async (c) => {
    const body = await parseJson(c.req, RuntimeHeartbeatSchema);
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
    const body = await parseJson(c.req, LeaseRequestSchema);
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

  app.post("/api/daemon/events", async (c) => {
    const body = await parseJson(c.req, LeaseEventUploadSchema);
    try {
      store.assertLease({ leaseId: body.leaseId, runtimeId: body.runtimeId, sessionId: body.sessionId, now: now() });
    } catch (err) {
      if (err instanceof LeaseError) {
        return c.json({ error: err.message }, 409);
      }
      throw err;
    }
    const events = store.appendSessionEvents(body.sessionId, body.events);
    store.updateSession(body.sessionId, { status: "running", updatedAt: now() });
    return c.json({ events });
  });

  app.post("/api/daemon/outcome", async (c) => {
    const body = await parseJson(c.req, LeaseOutcomeUploadSchema);
    try {
      store.assertLease({ leaseId: body.leaseId, runtimeId: body.runtimeId, sessionId: body.sessionId, now: now() });
    } catch (err) {
      if (err instanceof LeaseError) {
        return c.json({ error: err.message }, 409);
      }
      throw err;
    }
    const outcome = store.saveOutcome(body.outcome);
    return c.json({ outcome, session: store.getSession(body.sessionId) });
  });

  return app;
}

async function parseJson<T extends z.ZodTypeAny>(req: { json: () => Promise<unknown> }, schema: T): Promise<z.infer<T>> {
  return schema.parse(await req.json());
}

function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}
