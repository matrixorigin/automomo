import Database from "better-sqlite3";
import { asc, eq } from "drizzle-orm";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import * as schema from "./schema";
import {
  Agent,
  AgentSchema,
  ApiKey,
  ApiKeySchema,
  AuditEvent,
  AuditEventSchema,
  Codebase,
  CodebaseSchema,
  Daemon,
  DaemonSchema,
  HumanHandoff,
  HumanHandoffSchema,
  OrchestrationRule,
  OrchestrationRuleSchema,
  Outcome,
  OutcomeSchema,
  Room,
  RoomAgent,
  RoomAgentSchema,
  RoomListQuery,
  RoomListResponse,
  RoomMessage,
  RoomMessageSchema,
  RoomSchema,
  RoomTask,
  RoomTaskSchema,
  Runtime,
  RuntimeSchema,
  Session,
  SessionEvent,
  SessionEventSchema,
  SessionListQuery,
  SessionListResponse,
  SessionSchema,
  WorkItem,
  WorkItemListQuery,
  WorkItemListResponse,
  WorkItemSchema
} from "@automomo/protocol";

export interface RuntimeLease {
  id: string;
  runtimeId: string;
  sessionId: string;
  daemonId?: string;
  expiresAt: string;
  renewedAt?: string;
  completedAt?: string;
  failedAt?: string;
  createdAt: string;
}

export type ApiKeyInput = Omit<ApiKey, "tokenHash" | "metadata"> & {
  token?: string;
  tokenHash?: string;
  metadata?: Record<string, unknown>;
};

export class LeaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaseError";
  }
}

export interface ControlPlaneStore {
  saveCodebase(codebase: Codebase): Codebase;
  listCodebases(): Codebase[];
  saveRoom(room: Room): Room;
  listRooms(): Room[];
  listRooms(query: RoomListQuery): RoomListResponse;
  getRoom(id: string): Room | undefined;
  saveRoomAgent(roomAgent: RoomAgent): RoomAgent;
  listRoomAgents(roomId: string): RoomAgent[];
  saveRoomMessage(message: RoomMessage): RoomMessage;
  listRoomMessages(roomId: string): RoomMessage[];
  saveRoomTask(task: RoomTask): RoomTask;
  listRoomTasks(roomId: string): RoomTask[];
  saveWorkItem(item: WorkItem): WorkItem;
  listWorkItems(): WorkItem[];
  listWorkItems(query: WorkItemListQuery): WorkItemListResponse;
  getWorkItem(id: string): WorkItem | undefined;
  saveOrchestrationRule(rule: OrchestrationRule): OrchestrationRule;
  listOrchestrationRules(): OrchestrationRule[];
  saveSession(session: Session): Session;
  listSessions(): Session[];
  listSessions(query: SessionListQuery): SessionListResponse;
  getSession(id: string): Session | undefined;
  updateSession(id: string, patch: Partial<Session>): Session | undefined;
  appendSessionEvents(sessionId: string, events: SessionEvent[]): SessionEvent[];
  listSessionEvents(sessionId: string): SessionEvent[];
  listAllSessionEvents(limit?: number): SessionEvent[];
  saveRuntime(runtime: Runtime): Runtime;
  listRuntimes(): Runtime[];
  getRuntime(id: string): Runtime | undefined;
  saveAgent(agent: Agent): Agent;
  listAgents(): Agent[];
  getAgent(id: string): Agent | undefined;
  saveOutcome(outcome: Outcome): Outcome;
  getOutcome(id: string): Outcome | undefined;
  getOutcomeForSession(sessionId: string): Outcome | undefined;
  saveHandoff(handoff: HumanHandoff): HumanHandoff;
  listHandoffs(sessionId?: string): HumanHandoff[];
  saveDaemon(daemon: Daemon & { secret: string }): Daemon & { secret: string };
  getDaemon(id: string): (Daemon & { secret: string }) | undefined;
  listDaemons(): Daemon[];
  recordDaemonNonce(input: { daemonId: string; nonce: string; expiresAt: string }): boolean;
  createLease(lease: RuntimeLease): RuntimeLease;
  findLease(id: string): RuntimeLease | undefined;
  renewLease(input: { leaseId: string; runtimeId: string; now: string; daemonId?: string }): RuntimeLease | undefined;
  failLease(input: { leaseId: string; runtimeId: string; sessionId: string; now: string; daemonId?: string }): RuntimeLease | undefined;
  completeLease(input: { leaseId: string; now: string }): RuntimeLease | undefined;
  reclaimExpiredLeases(now: string): RuntimeLease[];
  assertLease(input: { leaseId: string; runtimeId: string; sessionId: string; now: string; daemonId?: string }): RuntimeLease;
  nextQueuedSession(runtimeId: string): Session | undefined;
  createApiKey(input: ApiKeyInput): ApiKey;
  findApiKeyByToken(token: string): ApiKey | undefined;
  appendAuditEvent(event: AuditEvent): AuditEvent;
  listAuditEvents(): AuditEvent[];
}

export class MemoryStore implements ControlPlaneStore {
  readonly codebases = new Map<string, Codebase>();
  readonly rooms = new Map<string, Room>();
  readonly roomAgents = new Map<string, RoomAgent>();
  readonly roomMessages = new Map<string, RoomMessage>();
  readonly roomTasks = new Map<string, RoomTask>();
  readonly workItems = new Map<string, WorkItem>();
  readonly orchestrationRules = new Map<string, OrchestrationRule>();
  readonly sessions = new Map<string, Session>();
  readonly events = new Map<string, SessionEvent[]>();
  readonly agents = new Map<string, Agent>();
  readonly runtimes = new Map<string, Runtime>();
  readonly outcomes = new Map<string, Outcome>();
  readonly handoffs = new Map<string, HumanHandoff[]>();
  readonly daemons = new Map<string, Daemon & { secret: string }>();
  readonly daemonNonces = new Map<string, string>();
  readonly leases = new Map<string, RuntimeLease>();
  readonly apiKeys = new Map<string, ApiKey>();
  readonly auditEvents: AuditEvent[] = [];

  saveCodebase(codebase: Codebase) {
    const parsed = CodebaseSchema.parse(codebase);
    this.codebases.set(parsed.id, parsed);
    return parsed;
  }

  listCodebases() {
    return [...this.codebases.values()];
  }

  saveRoom(room: Room) {
    const parsed = RoomSchema.parse(room);
    this.rooms.set(parsed.id, parsed);
    return parsed;
  }

  listRooms(): Room[];
  listRooms(query: RoomListQuery): RoomListResponse;
  listRooms(query?: RoomListQuery) {
    const items = sortByCreatedAtAndId([...this.rooms.values()]);
    return query ? paginate(filterRooms(items, query), query) : items;
  }

  getRoom(id: string) {
    return this.rooms.get(id);
  }

  saveRoomAgent(roomAgent: RoomAgent) {
    const parsed = RoomAgentSchema.parse(roomAgent);
    this.roomAgents.set(parsed.id, parsed);
    return parsed;
  }

  listRoomAgents(roomId: string) {
    return sortByCreatedAtAndId([...this.roomAgents.values()].filter((roomAgent) => roomAgent.roomId === roomId));
  }

  saveRoomMessage(message: RoomMessage) {
    const parsed = RoomMessageSchema.parse(message);
    this.roomMessages.set(parsed.id, parsed);
    return parsed;
  }

  listRoomMessages(roomId: string) {
    return sortByCreatedAtAndId([...this.roomMessages.values()].filter((message) => message.roomId === roomId));
  }

  saveRoomTask(task: RoomTask) {
    const parsed = RoomTaskSchema.parse(task);
    this.roomTasks.set(parsed.id, parsed);
    return parsed;
  }

  listRoomTasks(roomId: string) {
    return sortByCreatedAtAndId([...this.roomTasks.values()].filter((task) => task.roomId === roomId));
  }

  saveWorkItem(item: WorkItem) {
    const parsed = WorkItemSchema.parse(item);
    this.workItems.set(parsed.id, parsed);
    return parsed;
  }

  listWorkItems(): WorkItem[];
  listWorkItems(query: WorkItemListQuery): WorkItemListResponse;
  listWorkItems(query?: WorkItemListQuery) {
    const items = sortByCreatedAtAndId([...this.workItems.values()]);
    return query ? paginate(filterWorkItems(items, query), query) : items;
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

  listSessions(): Session[];
  listSessions(query: SessionListQuery): SessionListResponse;
  listSessions(query?: SessionListQuery) {
    const items = sortByCreatedAtAndId([...this.sessions.values()]);
    return query ? paginate(filterSessions(items, query), query) : items;
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

  listAllSessionEvents(limit = 50) {
    return [...this.events.values()]
      .flat()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.sequence - a.sequence || b.id.localeCompare(a.id))
      .slice(0, limit);
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

  getOutcome(id: string) {
    return this.outcomes.get(id);
  }

  getOutcomeForSession(sessionId: string) {
    return [...this.outcomes.values()].find((outcome) => outcome.sessionId === sessionId);
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

  listHandoffs(sessionId?: string) {
    if (sessionId) {
      return this.handoffs.get(sessionId) ?? [];
    }
    return [...this.handoffs.values()].flat();
  }

  saveDaemon(daemon: Daemon & { secret: string }) {
    const parsed = { ...DaemonSchema.parse(daemon), secret: daemon.secret };
    this.daemons.set(parsed.id, parsed);
    return parsed;
  }

  getDaemon(id: string) {
    return this.daemons.get(id);
  }

  listDaemons() {
    return [...this.daemons.values()].map(({ secret: _secret, ...daemon }) => daemon);
  }

  recordDaemonNonce(input: { daemonId: string; nonce: string; expiresAt: string }) {
    const key = `${input.daemonId}:${input.nonce}`;
    if (this.daemonNonces.has(key)) {
      return false;
    }
    this.daemonNonces.set(key, input.expiresAt);
    return true;
  }

  createLease(lease: RuntimeLease) {
    this.leases.set(lease.id, lease);
    if (!lease.completedAt && !lease.failedAt) {
      this.updateSession(lease.sessionId, {
        leaseId: lease.id,
        runtimeId: lease.runtimeId,
        status: "leased",
        updatedAt: lease.createdAt
      });
    }
    return lease;
  }

  findLease(id: string) {
    return this.leases.get(id);
  }

  renewLease(input: { leaseId: string; runtimeId: string; now: string; daemonId?: string }) {
    const lease = this.findLease(input.leaseId);
    if (!lease || lease.runtimeId !== input.runtimeId || (input.daemonId && lease.daemonId && lease.daemonId !== input.daemonId)) {
      return undefined;
    }
    const renewed = { ...lease, renewedAt: input.now, expiresAt: new Date(Date.parse(input.now) + 5 * 60 * 1000).toISOString() };
    this.leases.set(renewed.id, renewed);
    return renewed;
  }

  failLease(input: { leaseId: string; runtimeId: string; sessionId: string; now: string; daemonId?: string }) {
    const lease = this.findLease(input.leaseId);
    if (
      !lease ||
      lease.runtimeId !== input.runtimeId ||
      lease.sessionId !== input.sessionId ||
      (input.daemonId && lease.daemonId && lease.daemonId !== input.daemonId)
    ) {
      return undefined;
    }
    const failed = { ...lease, failedAt: input.now };
    this.leases.set(failed.id, failed);
    this.updateSession(input.sessionId, { status: "failed", updatedAt: input.now, completedAt: input.now });
    return failed;
  }

  completeLease(input: { leaseId: string; now: string }) {
    const lease = this.findLease(input.leaseId);
    if (!lease) {
      return undefined;
    }
    const completed = { ...lease, completedAt: input.now };
    this.leases.set(completed.id, completed);
    return completed;
  }

  reclaimExpiredLeases(now: string) {
    const reclaimed: RuntimeLease[] = [];
    for (const lease of this.leases.values()) {
      if (!lease.completedAt && !lease.failedAt && Date.parse(lease.expiresAt) <= Date.parse(now)) {
        const failed = { ...lease, failedAt: now };
        this.leases.set(failed.id, failed);
        this.updateSession(lease.sessionId, { status: "queued", leaseId: undefined, updatedAt: now });
        reclaimed.push(failed);
      }
    }
    return reclaimed;
  }

  assertLease(input: { leaseId: string; runtimeId: string; sessionId: string; now: string; daemonId?: string }) {
    const lease = this.findLease(input.leaseId);
    if (!lease) {
      throw new LeaseError("lease not found");
    }
    if (lease.runtimeId !== input.runtimeId || lease.sessionId !== input.sessionId) {
      throw new LeaseError("lease does not match runtime and session");
    }
    if (input.daemonId && lease.daemonId && lease.daemonId !== input.daemonId) {
      throw new LeaseError("lease does not match daemon");
    }
    if (lease.completedAt || lease.failedAt) {
      throw new LeaseError("lease is closed");
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

  createApiKey(input: ApiKeyInput) {
    const tokenHash = input.tokenHash ?? hashToken(input.token ?? "");
    const parsed = ApiKeySchema.parse({ ...input, tokenHash, metadata: input.metadata ?? {} });
    this.apiKeys.set(parsed.id, parsed);
    return parsed;
  }

  findApiKeyByToken(token: string) {
    const tokenHash = hashToken(token);
    return [...this.apiKeys.values()].find((key) => key.tokenHash === tokenHash);
  }

  appendAuditEvent(event: AuditEvent) {
    const parsed = AuditEventSchema.parse(event);
    this.auditEvents.push(parsed);
    return parsed;
  }

  listAuditEvents() {
    return [...this.auditEvents];
  }
}

export interface SQLiteStoreOptions {
  path?: string;
}

type CodebaseRow = typeof schema.codebases.$inferSelect;
type RoomRow = typeof schema.rooms.$inferSelect;
type RoomAgentRow = typeof schema.roomAgents.$inferSelect;
type RoomMessageRow = typeof schema.roomMessages.$inferSelect;
type RoomTaskRow = typeof schema.roomTasks.$inferSelect;
type WorkItemRow = typeof schema.workItems.$inferSelect;
type OrchestrationRuleRow = typeof schema.orchestrationRules.$inferSelect;
type SessionRow = typeof schema.sessions.$inferSelect;
type SessionEventRow = typeof schema.sessionEvents.$inferSelect;
type RuntimeRow = typeof schema.runtimes.$inferSelect;
type AgentRow = typeof schema.agents.$inferSelect;
type RuntimeLeaseRow = typeof schema.runtimeLeases.$inferSelect;
type HumanHandoffRow = typeof schema.humanHandoffs.$inferSelect;
type OutcomeRow = typeof schema.outcomes.$inferSelect;
type DaemonRow = typeof schema.daemons.$inferSelect;
type ApiKeyRow = typeof schema.apiKeys.$inferSelect;
type AuditEventRow = typeof schema.auditEvents.$inferSelect;

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

  saveRoom(room: Room) {
    const parsed = RoomSchema.parse(room);
    this.db
      .insert(schema.rooms)
      .values({
        id: parsed.id,
        codebaseId: parsed.codebaseId,
        name: parsed.name,
        description: parsed.description,
        status: parsed.status,
        metadataJson: stringifyJson(parsed.metadata),
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      })
      .onConflictDoUpdate({
        target: schema.rooms.id,
        set: {
          codebaseId: parsed.codebaseId,
          name: parsed.name,
          description: parsed.description,
          status: parsed.status,
          metadataJson: stringifyJson(parsed.metadata),
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt
        }
      })
      .run();
    return parsed;
  }

  listRooms(): Room[];
  listRooms(query: RoomListQuery): RoomListResponse;
  listRooms(query?: RoomListQuery) {
    const items = this.db
      .select()
      .from(schema.rooms)
      .orderBy(asc(schema.rooms.createdAt), asc(schema.rooms.id))
      .all()
      .map(rowToRoom);
    return query ? paginate(filterRooms(items, query), query) : items;
  }

  getRoom(id: string) {
    const row = this.db.select().from(schema.rooms).where(eq(schema.rooms.id, id)).get();
    return row ? rowToRoom(row) : undefined;
  }

  saveRoomAgent(roomAgent: RoomAgent) {
    const parsed = RoomAgentSchema.parse(roomAgent);
    this.db
      .insert(schema.roomAgents)
      .values({
        id: parsed.id,
        roomId: parsed.roomId,
        agentId: parsed.agentId,
        metadataJson: stringifyJson(parsed.metadata),
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      })
      .onConflictDoUpdate({
        target: schema.roomAgents.id,
        set: {
          roomId: parsed.roomId,
          agentId: parsed.agentId,
          metadataJson: stringifyJson(parsed.metadata),
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt
        }
      })
      .run();
    return parsed;
  }

  listRoomAgents(roomId: string) {
    return this.db
      .select()
      .from(schema.roomAgents)
      .where(eq(schema.roomAgents.roomId, roomId))
      .orderBy(asc(schema.roomAgents.createdAt), asc(schema.roomAgents.id))
      .all()
      .map(rowToRoomAgent);
  }

  saveRoomMessage(message: RoomMessage) {
    const parsed = RoomMessageSchema.parse(message);
    this.db
      .insert(schema.roomMessages)
      .values({
        id: parsed.id,
        roomId: parsed.roomId,
        authorJson: stringifyJson(parsed.author),
        body: parsed.body,
        metadataJson: stringifyJson(parsed.metadata),
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      })
      .onConflictDoUpdate({
        target: schema.roomMessages.id,
        set: {
          roomId: parsed.roomId,
          authorJson: stringifyJson(parsed.author),
          body: parsed.body,
          metadataJson: stringifyJson(parsed.metadata),
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt
        }
      })
      .run();
    return parsed;
  }

  listRoomMessages(roomId: string) {
    return this.db
      .select()
      .from(schema.roomMessages)
      .where(eq(schema.roomMessages.roomId, roomId))
      .orderBy(asc(schema.roomMessages.createdAt), asc(schema.roomMessages.id))
      .all()
      .map(rowToRoomMessage);
  }

  saveRoomTask(task: RoomTask) {
    const parsed = RoomTaskSchema.parse(task);
    this.db
      .insert(schema.roomTasks)
      .values({
        id: parsed.id,
        roomId: parsed.roomId,
        title: parsed.title,
        body: parsed.body,
        status: parsed.status,
        assignedAgentId: parsed.assignedAgentId,
        workItemId: parsed.workItemId,
        metadataJson: stringifyJson(parsed.metadata),
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      })
      .onConflictDoUpdate({
        target: schema.roomTasks.id,
        set: {
          roomId: parsed.roomId,
          title: parsed.title,
          body: parsed.body,
          status: parsed.status,
          assignedAgentId: parsed.assignedAgentId,
          workItemId: parsed.workItemId,
          metadataJson: stringifyJson(parsed.metadata),
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt
        }
      })
      .run();
    return parsed;
  }

  listRoomTasks(roomId: string) {
    return this.db
      .select()
      .from(schema.roomTasks)
      .where(eq(schema.roomTasks.roomId, roomId))
      .orderBy(asc(schema.roomTasks.createdAt), asc(schema.roomTasks.id))
      .all()
      .map(rowToRoomTask);
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

  listWorkItems(): WorkItem[];
  listWorkItems(query: WorkItemListQuery): WorkItemListResponse;
  listWorkItems(query?: WorkItemListQuery) {
    const items = this.db
      .select()
      .from(schema.workItems)
      .orderBy(asc(schema.workItems.createdAt), asc(schema.workItems.id))
      .all()
      .map(rowToWorkItem);
    return query ? paginate(filterWorkItems(items, query), query) : items;
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
        roomId: parsed.roomId,
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
          roomId: parsed.roomId,
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

  listSessions(): Session[];
  listSessions(query: SessionListQuery): SessionListResponse;
  listSessions(query?: SessionListQuery) {
    const items = this.db
      .select()
      .from(schema.sessions)
      .orderBy(asc(schema.sessions.createdAt), asc(schema.sessions.id))
      .all()
      .map(rowToSession);
    return query ? paginate(filterSessions(items, query), query) : items;
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

  listAllSessionEvents(limit = 50) {
    return this.db
      .select()
      .from(schema.sessionEvents)
      .orderBy(asc(schema.sessionEvents.createdAt), asc(schema.sessionEvents.sequence))
      .all()
      .map(rowToSessionEvent)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.sequence - a.sequence || b.id.localeCompare(a.id))
      .slice(0, limit);
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

  getOutcome(id: string) {
    const row = this.db.select().from(schema.outcomes).where(eq(schema.outcomes.id, id)).get();
    return row ? rowToOutcome(row) : undefined;
  }

  getOutcomeForSession(sessionId: string) {
    const row = this.db.select().from(schema.outcomes).where(eq(schema.outcomes.sessionId, sessionId)).get();
    return row ? rowToOutcome(row) : undefined;
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

  listHandoffs(sessionId?: string) {
    const rows = sessionId
      ? this.db.select().from(schema.humanHandoffs).where(eq(schema.humanHandoffs.sessionId, sessionId)).all()
      : this.db.select().from(schema.humanHandoffs).all();
    return rows.map(rowToHumanHandoff).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  saveDaemon(daemon: Daemon & { secret: string }) {
    const parsed = { ...DaemonSchema.parse(daemon), secret: daemon.secret };
    this.db
      .insert(schema.daemons)
      .values({
        id: parsed.id,
        runtimeId: parsed.runtimeId,
        name: parsed.name,
        secretId: parsed.secretId,
        secret: parsed.secret,
        signatureVersion: parsed.signatureVersion,
        status: parsed.status,
        lastSeenAt: parsed.lastSeenAt,
        metadataJson: stringifyJson(parsed.metadata),
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      })
      .onConflictDoUpdate({
        target: schema.daemons.id,
        set: {
          runtimeId: parsed.runtimeId,
          name: parsed.name,
          secretId: parsed.secretId,
          secret: parsed.secret,
          signatureVersion: parsed.signatureVersion,
          status: parsed.status,
          lastSeenAt: parsed.lastSeenAt,
          metadataJson: stringifyJson(parsed.metadata),
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt
        }
      })
      .run();
    return parsed;
  }

  getDaemon(id: string) {
    const row = this.db.select().from(schema.daemons).where(eq(schema.daemons.id, id)).get();
    return row ? rowToDaemonWithSecret(row) : undefined;
  }

  listDaemons() {
    return this.db
      .select()
      .from(schema.daemons)
      .orderBy(asc(schema.daemons.createdAt), asc(schema.daemons.id))
      .all()
      .map((row) => {
        const { secret: _secret, ...daemon } = rowToDaemonWithSecret(row);
        return daemon;
      });
  }

  recordDaemonNonce(input: { daemonId: string; nonce: string; expiresAt: string }) {
    const existing = this.db
      .select()
      .from(schema.daemonNonces)
      .where(eq(schema.daemonNonces.daemonId, input.daemonId))
      .all()
      .some((row) => row.nonce === input.nonce);
    if (existing) {
      return false;
    }
    this.db
      .insert(schema.daemonNonces)
      .values({
        daemonId: input.daemonId,
        nonce: input.nonce,
        expiresAt: input.expiresAt
      })
      .run();
    return true;
  }

  createLease(lease: RuntimeLease) {
    this.db
      .insert(schema.runtimeLeases)
      .values({
        id: lease.id,
        runtimeId: lease.runtimeId,
        sessionId: lease.sessionId,
        daemonId: lease.daemonId,
        expiresAt: lease.expiresAt,
        renewedAt: lease.renewedAt,
        completedAt: lease.completedAt,
        failedAt: lease.failedAt,
        createdAt: lease.createdAt
      })
      .onConflictDoUpdate({
        target: schema.runtimeLeases.id,
        set: {
          runtimeId: lease.runtimeId,
          sessionId: lease.sessionId,
          daemonId: lease.daemonId,
          expiresAt: lease.expiresAt,
          renewedAt: lease.renewedAt,
          completedAt: lease.completedAt,
          failedAt: lease.failedAt,
          createdAt: lease.createdAt
        }
      })
      .run();
    if (!lease.completedAt && !lease.failedAt) {
      this.updateSession(lease.sessionId, {
        leaseId: lease.id,
        runtimeId: lease.runtimeId,
        status: "leased",
        updatedAt: lease.createdAt
      });
    }
    return lease;
  }

  findLease(id: string) {
    const row = this.db.select().from(schema.runtimeLeases).where(eq(schema.runtimeLeases.id, id)).get();
    return row ? rowToRuntimeLease(row) : undefined;
  }

  renewLease(input: { leaseId: string; runtimeId: string; now: string; daemonId?: string }) {
    const lease = this.findLease(input.leaseId);
    if (!lease || lease.runtimeId !== input.runtimeId || (input.daemonId && lease.daemonId && lease.daemonId !== input.daemonId)) {
      return undefined;
    }
    const renewed = { ...lease, renewedAt: input.now, expiresAt: new Date(Date.parse(input.now) + 5 * 60 * 1000).toISOString() };
    return this.createLease(renewed);
  }

  failLease(input: { leaseId: string; runtimeId: string; sessionId: string; now: string; daemonId?: string }) {
    const lease = this.findLease(input.leaseId);
    if (
      !lease ||
      lease.runtimeId !== input.runtimeId ||
      lease.sessionId !== input.sessionId ||
      (input.daemonId && lease.daemonId && lease.daemonId !== input.daemonId)
    ) {
      return undefined;
    }
    const failed = this.createLease({ ...lease, failedAt: input.now });
    this.updateSession(input.sessionId, { status: "failed", updatedAt: input.now, completedAt: input.now });
    return failed;
  }

  completeLease(input: { leaseId: string; now: string }) {
    const lease = this.findLease(input.leaseId);
    if (!lease) {
      return undefined;
    }
    return this.createLease({ ...lease, completedAt: input.now });
  }

  reclaimExpiredLeases(now: string) {
    const expired = this.db
      .select()
      .from(schema.runtimeLeases)
      .all()
      .map(rowToRuntimeLease)
      .filter((lease) => !lease.completedAt && !lease.failedAt && Date.parse(lease.expiresAt) <= Date.parse(now));
    for (const lease of expired) {
      this.createLease({ ...lease, failedAt: now });
      this.updateSession(lease.sessionId, { status: "queued", leaseId: undefined, updatedAt: now });
    }
    return expired.map((lease) => ({ ...lease, failedAt: now }));
  }

  assertLease(input: { leaseId: string; runtimeId: string; sessionId: string; now: string; daemonId?: string }) {
    const lease = this.findLease(input.leaseId);
    if (!lease) {
      throw new LeaseError("lease not found");
    }
    if (lease.runtimeId !== input.runtimeId || lease.sessionId !== input.sessionId) {
      throw new LeaseError("lease does not match runtime and session");
    }
    if (input.daemonId && lease.daemonId && lease.daemonId !== input.daemonId) {
      throw new LeaseError("lease does not match daemon");
    }
    if (lease.completedAt || lease.failedAt) {
      throw new LeaseError("lease is closed");
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

  createApiKey(input: ApiKeyInput) {
    const tokenHash = input.tokenHash ?? hashToken(input.token ?? "");
    const parsed = ApiKeySchema.parse({ ...input, tokenHash, metadata: input.metadata ?? {} });
    this.db
      .insert(schema.apiKeys)
      .values({
        id: parsed.id,
        name: parsed.name,
        tokenHash: parsed.tokenHash,
        scopesJson: stringifyJson(parsed.scopes),
        metadataJson: stringifyJson(parsed.metadata),
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt
      })
      .onConflictDoUpdate({
        target: schema.apiKeys.id,
        set: {
          name: parsed.name,
          tokenHash: parsed.tokenHash,
          scopesJson: stringifyJson(parsed.scopes),
          metadataJson: stringifyJson(parsed.metadata),
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt
        }
      })
      .run();
    return parsed;
  }

  findApiKeyByToken(token: string) {
    const tokenHash = hashToken(token);
    const row = this.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.tokenHash, tokenHash)).get();
    return row ? rowToApiKey(row) : undefined;
  }

  appendAuditEvent(event: AuditEvent) {
    const parsed = AuditEventSchema.parse(event);
    this.db
      .insert(schema.auditEvents)
      .values({
        id: parsed.id,
        actorType: parsed.actorType,
        actorId: parsed.actorId,
        action: parsed.action,
        targetType: parsed.targetType,
        targetId: parsed.targetId,
        metadataJson: stringifyJson(parsed.metadata),
        createdAt: parsed.createdAt
      })
      .run();
    return parsed;
  }

  listAuditEvents() {
    return this.db
      .select()
      .from(schema.auditEvents)
      .orderBy(asc(schema.auditEvents.createdAt), asc(schema.auditEvents.id))
      .all()
      .map(rowToAuditEvent);
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

      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        codebase_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS room_agents (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS room_agents_room_idx ON room_agents (room_id, created_at, id);

      CREATE TABLE IF NOT EXISTS room_messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        author_json TEXT NOT NULL,
        body TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS room_messages_room_idx ON room_messages (room_id, created_at, id);

      CREATE TABLE IF NOT EXISTS room_tasks (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        assigned_agent_id TEXT,
        work_item_id TEXT,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS room_tasks_room_idx ON room_tasks (room_id, created_at, id);

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
        room_id TEXT,
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

      CREATE TABLE IF NOT EXISTS daemons (
        id TEXT PRIMARY KEY,
        runtime_id TEXT NOT NULL,
        name TEXT NOT NULL,
        secret_id TEXT NOT NULL,
        secret TEXT NOT NULL,
        signature_version TEXT NOT NULL,
        status TEXT NOT NULL,
        last_seen_at TEXT,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runtime_leases (
        id TEXT PRIMARY KEY,
        runtime_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        daemon_id TEXT,
        expires_at TEXT NOT NULL,
        renewed_at TEXT,
        completed_at TEXT,
        failed_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daemon_nonces (
        daemon_id TEXT NOT NULL,
        nonce TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS daemon_nonces_identity_idx ON daemon_nonces (daemon_id, nonce);

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS api_keys_token_hash_idx ON api_keys (token_hash);

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        actor_type TEXT NOT NULL,
        actor_id TEXT,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    addColumnIfMissing(this.sqlite, "sessions", "room_id", "TEXT");
    addColumnIfMissing(this.sqlite, "runtime_leases", "daemon_id", "TEXT");
    addColumnIfMissing(this.sqlite, "runtime_leases", "renewed_at", "TEXT");
    addColumnIfMissing(this.sqlite, "runtime_leases", "completed_at", "TEXT");
    addColumnIfMissing(this.sqlite, "runtime_leases", "failed_at", "TEXT");
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

function rowToRoom(row: RoomRow): Room {
  return RoomSchema.parse({
    id: row.id,
    codebaseId: row.codebaseId,
    name: row.name,
    description: row.description,
    status: row.status,
    metadata: parseJson(row.metadataJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

function rowToRoomAgent(row: RoomAgentRow): RoomAgent {
  return RoomAgentSchema.parse({
    id: row.id,
    roomId: row.roomId,
    agentId: row.agentId,
    metadata: parseJson(row.metadataJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

function rowToRoomMessage(row: RoomMessageRow): RoomMessage {
  return RoomMessageSchema.parse({
    id: row.id,
    roomId: row.roomId,
    author: parseJson(row.authorJson),
    body: row.body,
    metadata: parseJson(row.metadataJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

function rowToRoomTask(row: RoomTaskRow): RoomTask {
  return RoomTaskSchema.parse({
    id: row.id,
    roomId: row.roomId,
    title: row.title,
    body: row.body,
    status: row.status,
    assignedAgentId: row.assignedAgentId ?? undefined,
    workItemId: row.workItemId ?? undefined,
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
    roomId: row.roomId ?? undefined,
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
    daemonId: row.daemonId ?? undefined,
    expiresAt: row.expiresAt,
    renewedAt: row.renewedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    failedAt: row.failedAt ?? undefined,
    createdAt: row.createdAt
  };
}

function rowToOutcome(row: OutcomeRow): Outcome {
  return OutcomeSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    status: row.status,
    summary: row.summary,
    result: parseJson(row.resultJson),
    eventsUploaded: row.eventsUploaded,
    createdAt: row.createdAt
  });
}

function rowToHumanHandoff(row: HumanHandoffRow): HumanHandoff {
  return HumanHandoffSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    status: row.status,
    reason: row.reason,
    note: row.note,
    claimedBy: row.claimedBy ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

function rowToDaemonWithSecret(row: DaemonRow): Daemon & { secret: string } {
  return {
    ...DaemonSchema.parse({
      id: row.id,
      runtimeId: row.runtimeId,
      name: row.name,
      secretId: row.secretId,
      signatureVersion: row.signatureVersion,
      status: row.status,
      lastSeenAt: row.lastSeenAt ?? undefined,
      metadata: parseJson(row.metadataJson),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }),
    secret: row.secret
  };
}

function rowToApiKey(row: ApiKeyRow): ApiKey {
  return ApiKeySchema.parse({
    id: row.id,
    name: row.name,
    tokenHash: row.tokenHash,
    scopes: parseJson(row.scopesJson),
    metadata: parseJson(row.metadataJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

function rowToAuditEvent(row: AuditEventRow): AuditEvent {
  return AuditEventSchema.parse({
    id: row.id,
    actorType: row.actorType,
    actorId: row.actorId ?? undefined,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId ?? undefined,
    metadata: parseJson(row.metadataJson),
    createdAt: row.createdAt
  });
}

function sortByCreatedAtAndId<T extends { createdAt: string; id: string }>(items: T[]) {
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function paginate<T>(items: T[], query: { limit: number; offset: number }) {
  return {
    items: items.slice(query.offset, query.offset + query.limit),
    page: {
      limit: query.limit,
      offset: query.offset,
      total: items.length
    }
  };
}

function filterWorkItems(items: WorkItem[], query: WorkItemListQuery) {
  const q = query.q?.toLowerCase();
  return items.filter((item) => {
    if (query.codebaseId && item.codebaseId !== query.codebaseId) return false;
    if (query.source && item.source !== query.source) return false;
    if (query.status && item.status !== query.status) return false;
    if (query.assignee && item.metadata.assignee !== query.assignee) return false;
    if (q && !`${item.title} ${item.body} ${item.labels.join(" ")}`.toLowerCase().includes(q)) return false;
    if (!withinRange(item.createdAt, query.createdAfter, query.createdBefore)) return false;
    if (!withinRange(item.updatedAt, query.updatedAfter, query.updatedBefore)) return false;
    return true;
  });
}

function filterRooms(items: Room[], query: RoomListQuery) {
  const q = query.q?.toLowerCase();
  return items.filter((room) => {
    if (query.codebaseId && room.codebaseId !== query.codebaseId) return false;
    if (query.status && room.status !== query.status) return false;
    if (q && !`${room.name} ${room.description}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function filterSessions(items: Session[], query: SessionListQuery) {
  const participant = query.participant?.toLowerCase();
  return items.filter((session) => {
    if (query.status && session.status !== query.status) return false;
    if (query.codebaseId && session.codebaseId !== query.codebaseId) return false;
    if (query.roomId && session.roomId !== query.roomId) return false;
    if (query.agentId && session.agentId !== query.agentId) return false;
    if (query.runtimeId && session.runtimeId !== query.runtimeId) return false;
    if (participant && !session.participants.some((item) => `${item.id ?? ""} ${item.name}`.toLowerCase().includes(participant))) {
      return false;
    }
    if (!withinRange(session.createdAt, query.createdAfter, query.createdBefore)) return false;
    if (!withinRange(session.updatedAt, query.updatedAfter, query.updatedBefore)) return false;
    return true;
  });
}

function withinRange(value: string, after?: string, before?: string) {
  const time = Date.parse(value);
  if (after && time < Date.parse(after)) return false;
  if (before && time > Date.parse(before)) return false;
  return true;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, type: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
