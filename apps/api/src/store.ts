import Database from "better-sqlite3";
import { asc, eq } from "drizzle-orm";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import * as schema from "./schema";
import {
  Agent,
  AgentSchema,
  Codebase,
  CodebaseSchema,
  HumanHandoff,
  HumanHandoffSchema,
  OrchestrationRule,
  OrchestrationRuleSchema,
  Outcome,
  OutcomeSchema,
  Runtime,
  RuntimeSchema,
  Session,
  SessionEvent,
  SessionEventSchema,
  SessionSchema,
  WorkItem,
  WorkItemSchema
} from "@automomo/protocol";

export interface RuntimeLease {
  id: string;
  runtimeId: string;
  sessionId: string;
  expiresAt: string;
  createdAt: string;
}

export class LeaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaseError";
  }
}

export interface ControlPlaneStore {
  saveCodebase(codebase: Codebase): Codebase;
  listCodebases(): Codebase[];
  saveWorkItem(item: WorkItem): WorkItem;
  listWorkItems(): WorkItem[];
  getWorkItem(id: string): WorkItem | undefined;
  saveOrchestrationRule(rule: OrchestrationRule): OrchestrationRule;
  listOrchestrationRules(): OrchestrationRule[];
  saveSession(session: Session): Session;
  listSessions(): Session[];
  getSession(id: string): Session | undefined;
  updateSession(id: string, patch: Partial<Session>): Session | undefined;
  appendSessionEvents(sessionId: string, events: SessionEvent[]): SessionEvent[];
  listSessionEvents(sessionId: string): SessionEvent[];
  saveRuntime(runtime: Runtime): Runtime;
  listRuntimes(): Runtime[];
  getRuntime(id: string): Runtime | undefined;
  saveAgent(agent: Agent): Agent;
  listAgents(): Agent[];
  getAgent(id: string): Agent | undefined;
  saveOutcome(outcome: Outcome): Outcome;
  saveHandoff(handoff: HumanHandoff): HumanHandoff;
  createLease(lease: RuntimeLease): RuntimeLease;
  findLease(id: string): RuntimeLease | undefined;
  assertLease(input: { leaseId: string; runtimeId: string; sessionId: string; now: string }): RuntimeLease;
  nextQueuedSession(runtimeId: string): Session | undefined;
}

export class MemoryStore implements ControlPlaneStore {
  readonly codebases = new Map<string, Codebase>();
  readonly workItems = new Map<string, WorkItem>();
  readonly orchestrationRules = new Map<string, OrchestrationRule>();
  readonly sessions = new Map<string, Session>();
  readonly events = new Map<string, SessionEvent[]>();
  readonly agents = new Map<string, Agent>();
  readonly runtimes = new Map<string, Runtime>();
  readonly outcomes = new Map<string, Outcome>();
  readonly handoffs = new Map<string, HumanHandoff[]>();
  readonly leases = new Map<string, RuntimeLease>();

  saveCodebase(codebase: Codebase) {
    const parsed = CodebaseSchema.parse(codebase);
    this.codebases.set(parsed.id, parsed);
    return parsed;
  }

  listCodebases() {
    return [...this.codebases.values()];
  }

  saveWorkItem(item: WorkItem) {
    const parsed = WorkItemSchema.parse(item);
    this.workItems.set(parsed.id, parsed);
    return parsed;
  }

  listWorkItems() {
    return [...this.workItems.values()];
  }

  getWorkItem(id: string) {
    return this.workItems.get(id);
  }

  saveOrchestrationRule(rule: OrchestrationRule) {
    const parsed = OrchestrationRuleSchema.parse(rule);
    this.orchestrationRules.set(parsed.id, parsed);
    return parsed;
  }

  listOrchestrationRules() {
    return [...this.orchestrationRules.values()];
  }

  saveSession(session: Session) {
    const parsed = SessionSchema.parse(session);
    this.sessions.set(parsed.id, parsed);
    return parsed;
  }

  listSessions() {
    return [...this.sessions.values()];
  }

  getSession(id: string) {
    return this.sessions.get(id);
  }

  updateSession(id: string, patch: Partial<Session>) {
    const current = this.sessions.get(id);
    if (!current) {
      return undefined;
    }
    return this.saveSession({ ...current, ...patch });
  }

  appendSessionEvents(sessionId: string, events: SessionEvent[]) {
    const existing = this.events.get(sessionId) ?? [];
    const parsed = events.map((event, index) =>
      SessionEventSchema.parse({
        ...event,
        sessionId,
        sequence: event.sequence ?? existing.length + index
      })
    );
    this.events.set(sessionId, [...existing, ...parsed]);
    return parsed;
  }

  listSessionEvents(sessionId: string) {
    return this.events.get(sessionId) ?? [];
  }

  saveRuntime(runtime: Runtime) {
    const parsed = RuntimeSchema.parse(runtime);
    this.runtimes.set(parsed.id, parsed);
    return parsed;
  }

  listRuntimes() {
    return [...this.runtimes.values()];
  }

  getRuntime(id: string) {
    return this.runtimes.get(id);
  }

  saveAgent(agent: Agent) {
    const parsed = AgentSchema.parse(agent);
    this.agents.set(parsed.id, parsed);
    return parsed;
  }

  listAgents() {
    return [...this.agents.values()];
  }

  getAgent(id: string) {
    return this.agents.get(id);
  }

  saveOutcome(outcome: Outcome) {
    const parsed = OutcomeSchema.parse(outcome);
    this.outcomes.set(parsed.id, parsed);
    this.updateSession(parsed.sessionId, {
      outcomeId: parsed.id,
      status: parsed.status === "success" ? "completed" : parsed.status,
      completedAt: parsed.createdAt,
      updatedAt: parsed.createdAt
    });
    return parsed;
  }

  saveHandoff(handoff: HumanHandoff) {
    const parsed = HumanHandoffSchema.parse(handoff);
    this.handoffs.set(parsed.sessionId, [...(this.handoffs.get(parsed.sessionId) ?? []), parsed]);
    const nextStatus =
      parsed.status === "claimed" ? "claimed_by_human" : parsed.status === "resumed" ? "resumed_by_agent" : "needs_human";
    this.updateSession(parsed.sessionId, {
      status: nextStatus,
      updatedAt: parsed.updatedAt
    });
    return parsed;
  }

  createLease(lease: RuntimeLease) {
    this.leases.set(lease.id, lease);
    this.updateSession(lease.sessionId, {
      leaseId: lease.id,
      runtimeId: lease.runtimeId,
      status: "leased",
      updatedAt: lease.createdAt
    });
    return lease;
  }

  findLease(id: string) {
    return this.leases.get(id);
  }

  assertLease(input: { leaseId: string; runtimeId: string; sessionId: string; now: string }) {
    const lease = this.findLease(input.leaseId);
    if (!lease) {
      throw new LeaseError("lease not found");
    }
    if (lease.runtimeId !== input.runtimeId || lease.sessionId !== input.sessionId) {
      throw new LeaseError("lease does not match runtime and session");
    }
    if (Date.parse(lease.expiresAt) <= Date.parse(input.now)) {
      throw new LeaseError("lease expired");
    }
    return lease;
  }

  nextQueuedSession(runtimeId: string) {
    return this.listSessions().find((session) => {
      if (session.status !== "queued") {
        return false;
      }
      return !session.runtimeId || session.runtimeId === runtimeId;
    });
  }
}

export interface SQLiteStoreOptions {
  path?: string;
}

type CodebaseRow = typeof schema.codebases.$inferSelect;
type WorkItemRow = typeof schema.workItems.$inferSelect;
type OrchestrationRuleRow = typeof schema.orchestrationRules.$inferSelect;
type SessionRow = typeof schema.sessions.$inferSelect;
type SessionEventRow = typeof schema.sessionEvents.$inferSelect;
type RuntimeRow = typeof schema.runtimes.$inferSelect;
type AgentRow = typeof schema.agents.$inferSelect;
type RuntimeLeaseRow = typeof schema.runtimeLeases.$inferSelect;

export class SQLiteStore implements ControlPlaneStore {
  private readonly sqlite: Database.Database;
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(options: SQLiteStoreOptions = {}) {
    const path = options.path ?? defaultDatabasePath();
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.sqlite = new Database(path);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.db = drizzle(this.sqlite, { schema });
    this.ensureSchema();
  }

  saveCodebase(codebase: Codebase) {
    const parsed = CodebaseSchema.parse(codebase);
    this.db
      .insert(schema.codebases)
      .values({
        id: parsed.id,
        name: parsed.name,
        provider: parsed.provider,
        sourceUrl: parsed.sourceUrl,
        defaultBranch: parsed.defaultBranch,
        workspaceRoot: parsed.workspaceRoot,
        status: parsed.status,
        metadataJson: stringifyJson(parsed.metadata),
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      })
      .onConflictDoUpdate({
        target: schema.codebases.id,
        set: {
          name: parsed.name,
          provider: parsed.provider,
          sourceUrl: parsed.sourceUrl,
          defaultBranch: parsed.defaultBranch,
          workspaceRoot: parsed.workspaceRoot,
          status: parsed.status,
          metadataJson: stringifyJson(parsed.metadata),
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt
        }
      })
      .run();
    return parsed;
  }

  listCodebases() {
    return this.db.select().from(schema.codebases).orderBy(asc(schema.codebases.createdAt)).all().map(rowToCodebase);
  }

  saveWorkItem(item: WorkItem) {
    const parsed = WorkItemSchema.parse(item);
    this.db
      .insert(schema.workItems)
      .values({
        id: parsed.id,
        codebaseId: parsed.codebaseId,
        title: parsed.title,
        body: parsed.body,
        source: parsed.source,
        status: parsed.status,
        priority: parsed.priority,
        labelsJson: stringifyJson(parsed.labels),
        connectorJson: stringifyOptionalJson(parsed.connector),
        metadataJson: stringifyJson(parsed.metadata),
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      })
      .onConflictDoUpdate({
        target: schema.workItems.id,
        set: {
          codebaseId: parsed.codebaseId,
          title: parsed.title,
          body: parsed.body,
          source: parsed.source,
          status: parsed.status,
          priority: parsed.priority,
          labelsJson: stringifyJson(parsed.labels),
          connectorJson: stringifyOptionalJson(parsed.connector),
          metadataJson: stringifyJson(parsed.metadata),
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt
        }
      })
      .run();
    return parsed;
  }

  listWorkItems() {
    return this.db.select().from(schema.workItems).orderBy(asc(schema.workItems.createdAt)).all().map(rowToWorkItem);
  }

  getWorkItem(id: string) {
    const row = this.db.select().from(schema.workItems).where(eq(schema.workItems.id, id)).get();
    return row ? rowToWorkItem(row) : undefined;
  }

  saveOrchestrationRule(rule: OrchestrationRule) {
    const parsed = OrchestrationRuleSchema.parse(rule);
    this.db
      .insert(schema.orchestrationRules)
      .values({
        id: parsed.id,
        codebaseId: parsed.codebaseId,
        name: parsed.name,
        enabled: parsed.enabled,
        trigger: parsed.trigger,
        matchJson: stringifyJson(parsed.match),
        agentId: parsed.agentId,
        runtimeId: parsed.runtimeId,
        humanApproval: parsed.humanApproval,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      })
      .onConflictDoUpdate({
        target: schema.orchestrationRules.id,
        set: {
          codebaseId: parsed.codebaseId,
          name: parsed.name,
          enabled: parsed.enabled,
          trigger: parsed.trigger,
          matchJson: stringifyJson(parsed.match),
          agentId: parsed.agentId,
          runtimeId: parsed.runtimeId,
          humanApproval: parsed.humanApproval,
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt
        }
      })
      .run();
    return parsed;
  }

  listOrchestrationRules() {
    return this.db
      .select()
      .from(schema.orchestrationRules)
      .orderBy(asc(schema.orchestrationRules.createdAt))
      .all()
      .map(rowToOrchestrationRule);
  }

  saveSession(session: Session) {
    const parsed = SessionSchema.parse(session);
    this.db
      .insert(schema.sessions)
      .values({
        id: parsed.id,
        codebaseId: parsed.codebaseId,
        workItemId: parsed.workItemId,
        agentId: parsed.agentId,
        runtimeId: parsed.runtimeId,
        status: parsed.status,
        participantsJson: stringifyJson(parsed.participants),
        leaseId: parsed.leaseId,
        outcomeId: parsed.outcomeId,
        metadataJson: stringifyJson(parsed.metadata),
        createdAt: parsed.createdAt,
        startedAt: parsed.startedAt,
        completedAt: parsed.completedAt,
        updatedAt: parsed.updatedAt
      })
      .onConflictDoUpdate({
        target: schema.sessions.id,
        set: {
          codebaseId: parsed.codebaseId,
          workItemId: parsed.workItemId,
          agentId: parsed.agentId,
          runtimeId: parsed.runtimeId,
          status: parsed.status,
          participantsJson: stringifyJson(parsed.participants),
          leaseId: parsed.leaseId,
          outcomeId: parsed.outcomeId,
          metadataJson: stringifyJson(parsed.metadata),
          createdAt: parsed.createdAt,
          startedAt: parsed.startedAt,
          completedAt: parsed.completedAt,
          updatedAt: parsed.updatedAt
        }
      })
      .run();
    return parsed;
  }

  listSessions() {
    return this.db.select().from(schema.sessions).orderBy(asc(schema.sessions.createdAt)).all().map(rowToSession);
  }

  getSession(id: string) {
    const row = this.db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();
    return row ? rowToSession(row) : undefined;
  }

  updateSession(id: string, patch: Partial<Session>) {
    const current = this.getSession(id);
    if (!current) {
      return undefined;
    }
    return this.saveSession({ ...current, ...patch });
  }

  appendSessionEvents(sessionId: string, events: SessionEvent[]) {
    const existing = this.listSessionEvents(sessionId);
    const parsed = events.map((event, index) =>
      SessionEventSchema.parse({
        ...event,
        sessionId,
        sequence: event.sequence ?? existing.length + index
      })
    );
    for (const event of parsed) {
      this.db
        .insert(schema.sessionEvents)
        .values({
          id: event.id,
          sessionId: event.sessionId,
          sequence: event.sequence,
          kind: event.kind,
          summary: event.summary,
          detail: event.detail,
          actorJson: stringifyOptionalJson(event.actor),
          metadataJson: stringifyJson(event.metadata),
          createdAt: event.createdAt
        })
        .onConflictDoUpdate({
          target: schema.sessionEvents.id,
          set: {
            sessionId: event.sessionId,
            sequence: event.sequence,
            kind: event.kind,
            summary: event.summary,
            detail: event.detail,
            actorJson: stringifyOptionalJson(event.actor),
            metadataJson: stringifyJson(event.metadata),
            createdAt: event.createdAt
          }
        })
        .run();
    }
    return parsed;
  }

  listSessionEvents(sessionId: string) {
    return this.db
      .select()
      .from(schema.sessionEvents)
      .where(eq(schema.sessionEvents.sessionId, sessionId))
      .orderBy(asc(schema.sessionEvents.sequence), asc(schema.sessionEvents.createdAt))
      .all()
      .map(rowToSessionEvent);
  }

  saveRuntime(runtime: Runtime) {
    const parsed = RuntimeSchema.parse(runtime);
    this.db
      .insert(schema.runtimes)
      .values({
        id: parsed.id,
        name: parsed.name,
        mode: parsed.mode,
        provider: parsed.provider,
        environmentJson: stringifyJson(parsed.environment),
        status: parsed.status,
        capacity: parsed.capacity,
        activeSessions: parsed.activeSessions,
        lastHeartbeatAt: parsed.lastHeartbeatAt,
        metadataJson: stringifyJson(parsed.metadata),
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      })
      .onConflictDoUpdate({
        target: schema.runtimes.id,
        set: {
          name: parsed.name,
          mode: parsed.mode,
          provider: parsed.provider,
          environmentJson: stringifyJson(parsed.environment),
          status: parsed.status,
          capacity: parsed.capacity,
          activeSessions: parsed.activeSessions,
          lastHeartbeatAt: parsed.lastHeartbeatAt,
          metadataJson: stringifyJson(parsed.metadata),
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt
        }
      })
      .run();
    return parsed;
  }

  listRuntimes() {
    return this.db.select().from(schema.runtimes).orderBy(asc(schema.runtimes.createdAt)).all().map(rowToRuntime);
  }

  getRuntime(id: string) {
    const row = this.db.select().from(schema.runtimes).where(eq(schema.runtimes.id, id)).get();
    return row ? rowToRuntime(row) : undefined;
  }

  saveAgent(agent: Agent) {
    const parsed = AgentSchema.parse(agent);
    this.db
      .insert(schema.agents)
      .values({
        id: parsed.id,
        name: parsed.name,
        model: parsed.model,
        instructions: parsed.instructions,
        skillsJson: stringifyJson(parsed.skills),
        toolsJson: stringifyJson(parsed.tools),
        defaultRuntimeId: parsed.defaultRuntimeId,
        maxConcurrency: parsed.maxConcurrency,
        metadataJson: stringifyJson(parsed.metadata),
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      })
      .onConflictDoUpdate({
        target: schema.agents.id,
        set: {
          name: parsed.name,
          model: parsed.model,
          instructions: parsed.instructions,
          skillsJson: stringifyJson(parsed.skills),
          toolsJson: stringifyJson(parsed.tools),
          defaultRuntimeId: parsed.defaultRuntimeId,
          maxConcurrency: parsed.maxConcurrency,
          metadataJson: stringifyJson(parsed.metadata),
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt
        }
      })
      .run();
    return parsed;
  }

  listAgents() {
    return this.db.select().from(schema.agents).orderBy(asc(schema.agents.createdAt)).all().map(rowToAgent);
  }

  getAgent(id: string) {
    const row = this.db.select().from(schema.agents).where(eq(schema.agents.id, id)).get();
    return row ? rowToAgent(row) : undefined;
  }

  saveOutcome(outcome: Outcome) {
    const parsed = OutcomeSchema.parse(outcome);
    this.db
      .insert(schema.outcomes)
      .values({
        id: parsed.id,
        sessionId: parsed.sessionId,
        status: parsed.status,
        summary: parsed.summary,
        resultJson: stringifyJson(parsed.result),
        eventsUploaded: parsed.eventsUploaded,
        createdAt: parsed.createdAt
      })
      .onConflictDoUpdate({
        target: schema.outcomes.id,
        set: {
          sessionId: parsed.sessionId,
          status: parsed.status,
          summary: parsed.summary,
          resultJson: stringifyJson(parsed.result),
          eventsUploaded: parsed.eventsUploaded,
          createdAt: parsed.createdAt
        }
      })
      .run();
    this.updateSession(parsed.sessionId, {
      outcomeId: parsed.id,
      status: parsed.status === "success" ? "completed" : parsed.status,
      completedAt: parsed.createdAt,
      updatedAt: parsed.createdAt
    });
    return parsed;
  }

  saveHandoff(handoff: HumanHandoff) {
    const parsed = HumanHandoffSchema.parse(handoff);
    this.db
      .insert(schema.humanHandoffs)
      .values({
        id: parsed.id,
        sessionId: parsed.sessionId,
        status: parsed.status,
        reason: parsed.reason,
        note: parsed.note,
        claimedBy: parsed.claimedBy,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      })
      .onConflictDoUpdate({
        target: schema.humanHandoffs.id,
        set: {
          sessionId: parsed.sessionId,
          status: parsed.status,
          reason: parsed.reason,
          note: parsed.note,
          claimedBy: parsed.claimedBy,
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt
        }
      })
      .run();
    const nextStatus =
      parsed.status === "claimed" ? "claimed_by_human" : parsed.status === "resumed" ? "resumed_by_agent" : "needs_human";
    this.updateSession(parsed.sessionId, {
      status: nextStatus,
      updatedAt: parsed.updatedAt
    });
    return parsed;
  }

  createLease(lease: RuntimeLease) {
    this.db
      .insert(schema.runtimeLeases)
      .values({
        id: lease.id,
        runtimeId: lease.runtimeId,
        sessionId: lease.sessionId,
        expiresAt: lease.expiresAt,
        createdAt: lease.createdAt
      })
      .onConflictDoUpdate({
        target: schema.runtimeLeases.id,
        set: {
          runtimeId: lease.runtimeId,
          sessionId: lease.sessionId,
          expiresAt: lease.expiresAt,
          createdAt: lease.createdAt
        }
      })
      .run();
    this.updateSession(lease.sessionId, {
      leaseId: lease.id,
      runtimeId: lease.runtimeId,
      status: "leased",
      updatedAt: lease.createdAt
    });
    return lease;
  }

  findLease(id: string) {
    const row = this.db.select().from(schema.runtimeLeases).where(eq(schema.runtimeLeases.id, id)).get();
    return row ? rowToRuntimeLease(row) : undefined;
  }

  assertLease(input: { leaseId: string; runtimeId: string; sessionId: string; now: string }) {
    const lease = this.findLease(input.leaseId);
    if (!lease) {
      throw new LeaseError("lease not found");
    }
    if (lease.runtimeId !== input.runtimeId || lease.sessionId !== input.sessionId) {
      throw new LeaseError("lease does not match runtime and session");
    }
    if (Date.parse(lease.expiresAt) <= Date.parse(input.now)) {
      throw new LeaseError("lease expired");
    }
    return lease;
  }

  nextQueuedSession(runtimeId: string) {
    return this.listSessions().find((session) => {
      if (session.status !== "queued") {
        return false;
      }
      return !session.runtimeId || session.runtimeId === runtimeId;
    });
  }

  close() {
    this.sqlite.close();
  }

  private ensureSchema() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS codebases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        source_url TEXT,
        default_branch TEXT,
        workspace_root TEXT,
        status TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY,
        codebase_id TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        labels_json TEXT NOT NULL,
        connector_json TEXT,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orchestration_rules (
        id TEXT PRIMARY KEY,
        codebase_id TEXT NOT NULL,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        trigger TEXT NOT NULL,
        match_json TEXT NOT NULL,
        agent_id TEXT,
        runtime_id TEXT,
        human_approval TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        codebase_id TEXT NOT NULL,
        work_item_id TEXT,
        agent_id TEXT,
        runtime_id TEXT,
        status TEXT NOT NULL,
        participants_json TEXT NOT NULL,
        lease_id TEXT,
        outcome_id TEXT,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        detail TEXT,
        actor_json TEXT,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS session_events_session_sequence_idx
        ON session_events (session_id, sequence);

      CREATE TABLE IF NOT EXISTS runtimes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL,
        provider TEXT NOT NULL,
        environment_json TEXT NOT NULL,
        status TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        active_sessions INTEGER NOT NULL,
        last_heartbeat_at TEXT,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        model TEXT,
        instructions TEXT NOT NULL,
        skills_json TEXT NOT NULL,
        tools_json TEXT NOT NULL,
        default_runtime_id TEXT,
        max_concurrency INTEGER NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS outcomes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        result_json TEXT NOT NULL,
        events_uploaded INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS human_handoffs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT NOT NULL,
        note TEXT NOT NULL,
        claimed_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runtime_leases (
        id TEXT PRIMARY KEY,
        runtime_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }
}

export function createDefaultStore() {
  return new SQLiteStore({ path: process.env.AUTOMOMO_DB_PATH ?? defaultDatabasePath() });
}

export function defaultDatabasePath() {
  return join(process.cwd(), ".automomo", "control-plane.sqlite");
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function stringifyOptionalJson(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function parseOptionalJson<T>(value: string | null): T | undefined {
  return value === null ? undefined : (JSON.parse(value) as T);
}

function rowToCodebase(row: CodebaseRow): Codebase {
  return CodebaseSchema.parse({
    id: row.id,
    name: row.name,
    provider: row.provider,
    sourceUrl: row.sourceUrl ?? undefined,
    defaultBranch: row.defaultBranch ?? undefined,
    workspaceRoot: row.workspaceRoot ?? undefined,
    status: row.status,
    metadata: parseJson(row.metadataJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

function rowToWorkItem(row: WorkItemRow): WorkItem {
  return WorkItemSchema.parse({
    id: row.id,
    codebaseId: row.codebaseId,
    title: row.title,
    body: row.body,
    source: row.source,
    status: row.status,
    priority: row.priority,
    labels: parseJson<string[]>(row.labelsJson),
    connector: parseOptionalJson(row.connectorJson),
    metadata: parseJson(row.metadataJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

function rowToOrchestrationRule(row: OrchestrationRuleRow): OrchestrationRule {
  return OrchestrationRuleSchema.parse({
    id: row.id,
    codebaseId: row.codebaseId,
    name: row.name,
    enabled: row.enabled,
    trigger: row.trigger,
    match: parseJson(row.matchJson),
    agentId: row.agentId ?? undefined,
    runtimeId: row.runtimeId ?? undefined,
    humanApproval: row.humanApproval,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

function rowToSession(row: SessionRow): Session {
  return SessionSchema.parse({
    id: row.id,
    codebaseId: row.codebaseId,
    workItemId: row.workItemId ?? undefined,
    agentId: row.agentId ?? undefined,
    runtimeId: row.runtimeId ?? undefined,
    status: row.status,
    participants: parseJson(row.participantsJson),
    leaseId: row.leaseId ?? undefined,
    outcomeId: row.outcomeId ?? undefined,
    metadata: parseJson(row.metadataJson),
    createdAt: row.createdAt,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    updatedAt: row.updatedAt
  });
}

function rowToSessionEvent(row: SessionEventRow): SessionEvent {
  return SessionEventSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    sequence: row.sequence,
    kind: row.kind,
    summary: row.summary,
    detail: row.detail ?? undefined,
    actor: parseOptionalJson(row.actorJson),
    metadata: parseJson(row.metadataJson),
    createdAt: row.createdAt
  });
}

function rowToRuntime(row: RuntimeRow): Runtime {
  return RuntimeSchema.parse({
    id: row.id,
    name: row.name,
    mode: row.mode,
    provider: row.provider,
    environment: parseJson(row.environmentJson),
    status: row.status,
    capacity: row.capacity,
    activeSessions: row.activeSessions,
    lastHeartbeatAt: row.lastHeartbeatAt ?? undefined,
    metadata: parseJson(row.metadataJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

function rowToAgent(row: AgentRow): Agent {
  return AgentSchema.parse({
    id: row.id,
    name: row.name,
    model: row.model ?? undefined,
    instructions: row.instructions,
    skills: parseJson<string[]>(row.skillsJson),
    tools: parseJson<string[]>(row.toolsJson),
    defaultRuntimeId: row.defaultRuntimeId ?? undefined,
    maxConcurrency: row.maxConcurrency,
    metadata: parseJson(row.metadataJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

function rowToRuntimeLease(row: RuntimeLeaseRow): RuntimeLease {
  return {
    id: row.id,
    runtimeId: row.runtimeId,
    sessionId: row.sessionId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt
  };
}
