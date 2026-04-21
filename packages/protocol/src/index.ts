import { z } from "zod";

export const ISODateString = z.string().datetime({ offset: true });
export const MetadataSchema = z.record(z.string(), z.unknown()).default({});
export const IdSchema = z.string().trim().min(1);

export const PrioritySchema = z.enum(["urgent", "high", "medium", "low"]);
export const CodebaseProviderSchema = z.enum(["local", "git", "github"]);
export const CodebaseStatusSchema = z.enum(["active", "archived"]);

export const CodebaseSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1),
  provider: CodebaseProviderSchema,
  sourceUrl: z.string().url().optional(),
  defaultBranch: z.string().trim().min(1).optional(),
  workspaceRoot: z.string().trim().min(1).optional(),
  status: CodebaseStatusSchema.default("active"),
  metadata: MetadataSchema,
  createdAt: ISODateString,
  updatedAt: ISODateString
});

export const RoomStatusSchema = z.enum(["active", "archived"]);

export const RoomSchema = z.object({
  id: IdSchema,
  codebaseId: IdSchema,
  name: z.string().trim().min(1),
  description: z.string().default(""),
  status: RoomStatusSchema.default("active"),
  metadata: MetadataSchema,
  createdAt: ISODateString,
  updatedAt: ISODateString
});

export const RoomAgentSchema = z.object({
  id: IdSchema,
  roomId: IdSchema,
  agentId: IdSchema,
  metadata: MetadataSchema,
  createdAt: ISODateString,
  updatedAt: ISODateString
});

export const RoomMessageHumanAuthorSchema = z.object({
  type: z.literal("human"),
  name: z.string().trim().min(1)
});

export const RoomMessageAgentAuthorSchema = z.object({
  type: z.literal("agent"),
  agentId: IdSchema,
  name: z.string().trim().min(1)
});

export const RoomMessageSystemAuthorSchema = z.object({
  type: z.literal("system"),
  name: z.string().trim().min(1)
});

export const RoomMessageAuthorSchema = z.discriminatedUnion("type", [
  RoomMessageHumanAuthorSchema,
  RoomMessageAgentAuthorSchema,
  RoomMessageSystemAuthorSchema
]);

export const RoomMessageSchema = z.object({
  id: IdSchema,
  roomId: IdSchema,
  author: RoomMessageAuthorSchema,
  body: z.string().trim().min(1),
  metadata: MetadataSchema,
  createdAt: ISODateString,
  updatedAt: ISODateString
});

export const RoomTaskStatusSchema = z.enum(["open", "running", "blocked", "done", "cancelled"]);

export const RoomTaskSchema = z.object({
  id: IdSchema,
  roomId: IdSchema,
  title: z.string().trim().min(1),
  body: z.string().default(""),
  status: RoomTaskStatusSchema.default("open"),
  assignedAgentId: IdSchema.optional(),
  workItemId: IdSchema.optional(),
  metadata: MetadataSchema,
  createdAt: ISODateString,
  updatedAt: ISODateString
});

export const WorkItemSourceSchema = z.enum(["manual", "api", "webhook", "schedule", "sync"]);
export const WorkItemStatusSchema = z.enum([
  "open",
  "ready",
  "running",
  "needs_human",
  "completed",
  "failed",
  "cancelled"
]);

export const ConnectorRefSchema = z.object({
  type: z.string().trim().min(1),
  id: z.string().trim().min(1).optional(),
  url: z.string().url().optional(),
  metadata: MetadataSchema
});

export const WorkItemSchema = z.object({
  id: IdSchema,
  codebaseId: IdSchema,
  roomId: IdSchema.optional(),
  title: z.string().trim().min(1),
  body: z.string().default(""),
  source: WorkItemSourceSchema.default("manual"),
  status: WorkItemStatusSchema.default("open"),
  priority: PrioritySchema.default("medium"),
  labels: z.array(z.string().trim().min(1)).default([]),
  connector: ConnectorRefSchema.optional(),
  metadata: MetadataSchema,
  createdAt: ISODateString,
  updatedAt: ISODateString
});

export const OrchestrationTriggerSchema = z.enum(["manual", "webhook", "schedule", "sync", "api"]);
export const HumanApprovalPolicySchema = z.enum(["never", "before_start", "before_result", "on_risk"]);

export const OrchestrationRuleSchema = z.object({
  id: IdSchema,
  codebaseId: IdSchema,
  name: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  trigger: OrchestrationTriggerSchema,
  match: MetadataSchema,
  agentId: IdSchema.optional(),
  runtimeId: IdSchema.optional(),
  humanApproval: HumanApprovalPolicySchema.default("on_risk"),
  createdAt: ISODateString,
  updatedAt: ISODateString
});

export const ParticipantSchema = z.object({
  id: z.string().trim().min(1).optional(),
  type: z.enum(["human", "agent"]),
  name: z.string().trim().min(1)
});

export const SessionStatusSchema = z.enum([
  "queued",
  "leased",
  "running",
  "needs_human",
  "claimed_by_human",
  "resumed_by_agent",
  "completed",
  "failed",
  "cancelled"
]);

export const SessionSchema = z.object({
  id: IdSchema,
  codebaseId: IdSchema,
  roomId: IdSchema.optional(),
  workItemId: IdSchema.optional(),
  agentId: IdSchema.optional(),
  runtimeId: IdSchema.optional(),
  status: SessionStatusSchema.default("queued"),
  participants: z.array(ParticipantSchema).default([]),
  leaseId: IdSchema.optional(),
  outcomeId: IdSchema.optional(),
  metadata: MetadataSchema,
  createdAt: ISODateString,
  startedAt: ISODateString.optional(),
  completedAt: ISODateString.optional(),
  updatedAt: ISODateString
});

export const SessionEventKindSchema = z.enum([
  "start",
  "tool",
  "text",
  "result",
  "handoff",
  "runtime",
  "finish",
  "failure"
]);

export const SessionEventSchema = z.object({
  id: IdSchema,
  sessionId: IdSchema,
  sequence: z.number().int().nonnegative(),
  kind: SessionEventKindSchema,
  summary: z.string().trim().min(1),
  detail: z.string().optional(),
  actor: ParticipantSchema.optional(),
  metadata: MetadataSchema,
  createdAt: ISODateString
});

export const RuntimeModeSchema = z.enum(["hosted", "remote_daemon", "local"]);
export const RuntimeProviderSchema = z.enum(["pi", "docker", "boxlite", "shell", "codex", "claude", "open_code"]);
export const RuntimeStatusSchema = z.enum(["idle", "online", "offline", "busy", "unhealthy"]);

export const RuntimeEnvironmentSchema = z.object({
  workspaceRoot: z.string().trim().min(1).optional(),
  image: z.string().trim().min(1).optional(),
  command: z.array(z.string()).optional(),
  memoryMB: z.number().int().positive().optional(),
  cpus: z.number().positive().optional(),
  networkPolicy: z.enum(["default", "restricted", "disabled"]).default("restricted"),
  env: z.record(z.string(), z.string()).default({}),
  secretRefs: z.array(z.string().trim().min(1)).default([])
});

export const RuntimeSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1),
  mode: RuntimeModeSchema,
  provider: RuntimeProviderSchema,
  environment: RuntimeEnvironmentSchema.default({}),
  status: RuntimeStatusSchema.default("offline"),
  capacity: z.number().int().positive().default(1),
  activeSessions: z.number().int().nonnegative().default(0),
  lastHeartbeatAt: ISODateString.optional(),
  metadata: MetadataSchema,
  createdAt: ISODateString,
  updatedAt: ISODateString
});

export const AgentSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1),
  model: z.string().trim().min(1).optional(),
  instructions: z.string().default(""),
  skills: z.array(z.string().trim().min(1)).default([]),
  tools: z.array(z.string().trim().min(1)).default([]),
  defaultRuntimeId: IdSchema.optional(),
  maxConcurrency: z.number().int().positive().default(1),
  metadata: MetadataSchema,
  createdAt: ISODateString,
  updatedAt: ISODateString
});

export const OutcomeSchema = z.object({
  id: IdSchema,
  sessionId: IdSchema,
  status: z.enum(["success", "failed", "needs_human"]),
  summary: z.string().trim().min(1),
  result: MetadataSchema,
  eventsUploaded: z.number().int().nonnegative().default(0),
  createdAt: ISODateString
});

export const HandoffStatusSchema = z.enum([
  "requested",
  "claimed",
  "responded",
  "resumed",
  "approved",
  "rejected",
  "completed"
]);

export const HumanHandoffSchema = z.object({
  id: IdSchema,
  sessionId: IdSchema,
  status: HandoffStatusSchema.default("requested"),
  reason: z.string().trim().min(1),
  note: z.string().default(""),
  claimedBy: z.string().trim().min(1).optional(),
  createdAt: ISODateString,
  updatedAt: ISODateString
});

export const HandoffActionSchema = z.object({
  action: z.enum(["request", "claim", "respond", "resume", "approve", "reject", "complete"]),
  reason: z.string().trim().min(1).optional(),
  note: z.string().default(""),
  claimedBy: z.string().trim().min(1).optional(),
  metadata: MetadataSchema
});

export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  total: z.number().int().nonnegative()
});

const QueryLimitSchema = z.coerce.number().int().min(1).max(200).default(50);
const QueryOffsetSchema = z.coerce.number().int().min(0).default(0);

export const WorkItemListQuerySchema = z.object({
  codebaseId: IdSchema.optional(),
  roomId: IdSchema.optional(),
  source: WorkItemSourceSchema.optional(),
  status: WorkItemStatusSchema.optional(),
  assignee: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  createdAfter: ISODateString.optional(),
  createdBefore: ISODateString.optional(),
  updatedAfter: ISODateString.optional(),
  updatedBefore: ISODateString.optional(),
  limit: QueryLimitSchema,
  offset: QueryOffsetSchema
});

export const SessionListQuerySchema = z.object({
  status: SessionStatusSchema.optional(),
  codebaseId: IdSchema.optional(),
  roomId: IdSchema.optional(),
  agentId: IdSchema.optional(),
  runtimeId: IdSchema.optional(),
  participant: z.string().trim().min(1).optional(),
  createdAfter: ISODateString.optional(),
  createdBefore: ISODateString.optional(),
  updatedAfter: ISODateString.optional(),
  updatedBefore: ISODateString.optional(),
  limit: QueryLimitSchema,
  offset: QueryOffsetSchema
});

export const WorkItemListResponseSchema = z.object({
  items: z.array(WorkItemSchema),
  page: PaginationSchema
});

export const SessionListResponseSchema = z.object({
  items: z.array(SessionSchema),
  page: PaginationSchema
});

export const RoomListQuerySchema = z.object({
  codebaseId: IdSchema.optional(),
  status: RoomStatusSchema.optional(),
  q: z.string().trim().min(1).optional(),
  limit: QueryLimitSchema,
  offset: QueryOffsetSchema
});

export const RoomListResponseSchema = z.object({
  items: z.array(RoomSchema),
  page: PaginationSchema
});

export const RoomAgentListResponseSchema = z.object({
  items: z.array(RoomAgentSchema),
  page: PaginationSchema
});

export const RoomMessageListResponseSchema = z.object({
  items: z.array(RoomMessageSchema),
  page: PaginationSchema
});

export const RoomTaskListResponseSchema = z.object({
  items: z.array(RoomTaskSchema),
  page: PaginationSchema
});

export const RoomCreateResponseSchema = z.object({
  room: RoomSchema
});

export const RoomAgentCreateResponseSchema = z.object({
  roomAgent: RoomAgentSchema
});

export const RoomMessageCreateResponseSchema = z.object({
  roomMessage: RoomMessageSchema
});

export const RoomTaskCreateResponseSchema = z.object({
  roomTask: RoomTaskSchema
});

export const OverviewSchema = z.object({
  counts: z.object({
    codebases: z.number().int().nonnegative().default(0),
    workItems: z.number().int().nonnegative().default(0),
    sessions: z.number().int().nonnegative().default(0),
    agents: z.number().int().nonnegative().default(0),
    runtimes: z.number().int().nonnegative().default(0)
  }),
  runtimeHealth: z.record(RuntimeStatusSchema, z.number().int().nonnegative()).default({
    idle: 0,
    online: 0,
    offline: 0,
    busy: 0,
    unhealthy: 0
  }),
  handoffCount: z.number().int().nonnegative().default(0),
  daemonCount: z.number().int().nonnegative().default(0),
  activeSessionCount: z.number().int().nonnegative().default(0),
  recentEvents: z.array(SessionEventSchema).default([])
});

export const RuleEvaluationResultSchema = z.discriminatedUnion("matched", [
  z.object({
    matched: z.literal(true),
    ruleId: IdSchema,
    reason: z.string().trim().min(1),
    agentId: IdSchema.optional(),
    runtimeId: IdSchema.optional(),
    requiresHumanApproval: z.boolean().default(false),
    metadata: MetadataSchema
  }),
  z.object({
    matched: z.literal(false),
    reason: z.string().trim().min(1),
    metadata: MetadataSchema
  })
]);

export const SessionStartRequestSchema = z.object({
  workItemId: IdSchema,
  roomId: IdSchema.optional(),
  trigger: OrchestrationTriggerSchema.default("manual")
});

export const SessionStartResultSchema = z.object({
  evaluation: RuleEvaluationResultSchema,
  session: SessionSchema.optional(),
  workItem: WorkItemSchema.optional()
});

export const SessionDetailResponseSchema = z.object({
  session: SessionSchema,
  events: z.array(SessionEventSchema).default([]),
  handoffs: z.array(HumanHandoffSchema).default([]),
  outcome: OutcomeSchema.optional(),
  workItem: WorkItemSchema.optional(),
  agent: AgentSchema.optional(),
  runtime: RuntimeSchema.optional(),
  room: RoomSchema.optional()
});

export const DaemonStatusSchema = z.enum(["online", "offline", "unhealthy"]);
export const SignatureVersionSchema = z.literal("hmac-sha256-v1");

export const DaemonSchema = z.object({
  id: IdSchema,
  runtimeId: IdSchema,
  name: z.string().trim().min(1),
  secretId: IdSchema,
  signatureVersion: SignatureVersionSchema.default("hmac-sha256-v1"),
  status: DaemonStatusSchema.default("online"),
  lastSeenAt: ISODateString.optional(),
  metadata: MetadataSchema,
  createdAt: ISODateString,
  updatedAt: ISODateString
});

export const DaemonRegistrationSchema = z.object({
  daemonId: IdSchema.optional(),
  runtimeId: IdSchema.optional(),
  name: z.string().trim().min(1),
  provider: RuntimeProviderSchema.default("pi"),
  environment: RuntimeEnvironmentSchema.default({})
});

export const DaemonRegistrationResponseSchema = z.object({
  daemon: DaemonSchema,
  runtime: RuntimeSchema,
  secret: z.string().trim().min(1)
});

export const DaemonSignedRequestHeadersSchema = z.object({
  daemonId: IdSchema,
  runtimeId: IdSchema,
  timestamp: ISODateString,
  nonce: IdSchema,
  signature: z.string().trim().min(1),
  signatureVersion: SignatureVersionSchema.default("hmac-sha256-v1")
});

export const RuntimeHeartbeatSchema = z.object({
  runtimeId: IdSchema,
  status: RuntimeStatusSchema,
  activeSessions: z.number().int().nonnegative().default(0),
  capacity: z.number().int().positive().default(1),
  observedAt: ISODateString
});

export const LeaseRequestSchema = z.object({
  runtimeId: IdSchema,
  capacity: z.number().int().positive().default(1)
});

export const LeaseSchema = z.object({
  leaseId: IdSchema,
  session: SessionSchema,
  workItem: WorkItemSchema.optional(),
  agent: AgentSchema.optional(),
  runtime: RuntimeSchema,
  expiresAt: ISODateString
});

export const LeaseResponseSchema = z.object({
  lease: LeaseSchema.nullable()
});

export const LeaseEventUploadSchema = z.object({
  runtimeId: IdSchema,
  leaseId: IdSchema,
  sessionId: IdSchema,
  events: z.array(SessionEventSchema).min(1)
});

export const LeaseOutcomeUploadSchema = z.object({
  runtimeId: IdSchema,
  leaseId: IdSchema,
  sessionId: IdSchema,
  outcome: OutcomeSchema
});

export const LeaseRenewRequestSchema = z.object({
  runtimeId: IdSchema,
  leaseId: IdSchema
});

export const LeaseFailureUploadSchema = z.object({
  runtimeId: IdSchema,
  leaseId: IdSchema,
  sessionId: IdSchema,
  reason: z.string().trim().min(1),
  detail: z.string().default(""),
  metadata: MetadataSchema
});

export const WorkItemUpsertRequestSchema = z.object({
  codebaseId: IdSchema,
  roomId: IdSchema.optional(),
  connector: ConnectorRefSchema,
  title: z.string().trim().min(1),
  body: z.string().default(""),
  labels: z.array(z.string().trim().min(1)).default([]),
  priority: PrioritySchema.default("medium"),
  source: WorkItemSourceSchema.default("api"),
  status: WorkItemStatusSchema.default("open"),
  metadata: MetadataSchema,
  evaluateRules: z.boolean().default(true)
});

export const WorkItemUpsertResultSchema = z.object({
  workItem: WorkItemSchema,
  created: z.boolean(),
  sessionStart: SessionStartResultSchema.optional()
});

export const RuntimeExecutionProviderSchema = z.enum(["shell", "docker", "pi"]);

export const RuntimeExecutionRequestSchema = z.object({
  sessionId: IdSchema,
  provider: RuntimeExecutionProviderSchema.default("shell"),
  timeoutMs: z.number().int().positive().optional(),
  metadata: MetadataSchema
});

export const RuntimeExecutionResultSchema = z.object({
  sessionId: IdSchema,
  status: z.enum(["success", "failed", "needs_human"]),
  outcomeId: IdSchema.optional(),
  eventsUploaded: z.number().int().nonnegative().default(0),
  metadata: MetadataSchema
});

export const PiRuntimeConfigSchema = z.object({
  mode: z.enum(["metadata", "sdk", "rpc"]).default("metadata"),
  cwd: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  thinkingLevel: z.enum(["low", "medium", "high"]).default("medium"),
  toolsMode: z.enum(["readonly", "workspace", "none"]).default("readonly"),
  skills: z.array(z.string().trim().min(1)).default([]),
  contextFiles: z.array(z.string().trim().min(1)).default([]),
  timeoutMs: z.number().int().positive().optional(),
  outcomeSchema: MetadataSchema
});

export const ApiKeyScopeSchema = z.object({
  codebaseId: IdSchema.optional(),
  actions: z.array(z.string().trim().min(1)).default([])
});

export const ApiKeySchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1),
  tokenHash: z.string().trim().min(1),
  scopes: z.array(ApiKeyScopeSchema).default([]),
  metadata: MetadataSchema,
  createdAt: ISODateString,
  updatedAt: ISODateString
});

export const AuditEventSchema = z.object({
  id: IdSchema,
  actorType: z.enum(["system", "human", "api_key", "daemon", "connector"]),
  actorId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1),
  targetType: z.string().trim().min(1),
  targetId: z.string().trim().min(1).optional(),
  metadata: MetadataSchema,
  createdAt: ISODateString
});

export const SessionEventEnvelopeSchema = z.object({
  type: z.literal("session.event"),
  version: z.literal(1),
  payload: SessionEventSchema
});

export type Codebase = z.infer<typeof CodebaseSchema>;
export type RoomStatus = z.infer<typeof RoomStatusSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type RoomAgent = z.infer<typeof RoomAgentSchema>;
export type RoomMessageHumanAuthor = z.infer<typeof RoomMessageHumanAuthorSchema>;
export type RoomMessageAgentAuthor = z.infer<typeof RoomMessageAgentAuthorSchema>;
export type RoomMessageSystemAuthor = z.infer<typeof RoomMessageSystemAuthorSchema>;
export type RoomMessageAuthor = z.infer<typeof RoomMessageAuthorSchema>;
export type RoomMessage = z.infer<typeof RoomMessageSchema>;
export type RoomTaskStatus = z.infer<typeof RoomTaskStatusSchema>;
export type RoomTask = z.infer<typeof RoomTaskSchema>;
export type WorkItem = z.infer<typeof WorkItemSchema>;
export type OrchestrationRule = z.infer<typeof OrchestrationRuleSchema>;
export type OrchestrationTrigger = z.infer<typeof OrchestrationTriggerSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type SessionEvent = z.infer<typeof SessionEventSchema>;
export type Runtime = z.infer<typeof RuntimeSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
export type HumanHandoff = z.infer<typeof HumanHandoffSchema>;
export type HandoffAction = z.infer<typeof HandoffActionSchema>;
export type WorkItemListQuery = z.infer<typeof WorkItemListQuerySchema>;
export type SessionListQuery = z.infer<typeof SessionListQuerySchema>;
export type RoomListQuery = z.infer<typeof RoomListQuerySchema>;
export type WorkItemListResponse = z.infer<typeof WorkItemListResponseSchema>;
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;
export type RoomListResponse = z.infer<typeof RoomListResponseSchema>;
export type RoomAgentListResponse = z.infer<typeof RoomAgentListResponseSchema>;
export type RoomMessageListResponse = z.infer<typeof RoomMessageListResponseSchema>;
export type RoomTaskListResponse = z.infer<typeof RoomTaskListResponseSchema>;
export type RoomCreateResponse = z.infer<typeof RoomCreateResponseSchema>;
export type RoomAgentCreateResponse = z.infer<typeof RoomAgentCreateResponseSchema>;
export type RoomMessageCreateResponse = z.infer<typeof RoomMessageCreateResponseSchema>;
export type RoomTaskCreateResponse = z.infer<typeof RoomTaskCreateResponseSchema>;
export type Overview = z.infer<typeof OverviewSchema>;
export type RuleEvaluationResult = z.infer<typeof RuleEvaluationResultSchema>;
export type SessionStartRequest = z.infer<typeof SessionStartRequestSchema>;
export type SessionStartResult = z.infer<typeof SessionStartResultSchema>;
export type SessionDetailResponse = z.infer<typeof SessionDetailResponseSchema>;
export type Daemon = z.infer<typeof DaemonSchema>;
export type DaemonRegistration = z.infer<typeof DaemonRegistrationSchema>;
export type DaemonRegistrationResponse = z.infer<typeof DaemonRegistrationResponseSchema>;
export type DaemonSignedRequestHeaders = z.infer<typeof DaemonSignedRequestHeadersSchema>;
export type RuntimeHeartbeat = z.infer<typeof RuntimeHeartbeatSchema>;
export type LeaseRequest = z.infer<typeof LeaseRequestSchema>;
export type Lease = z.infer<typeof LeaseSchema>;
export type LeaseResponse = z.infer<typeof LeaseResponseSchema>;
export type LeaseEventUpload = z.infer<typeof LeaseEventUploadSchema>;
export type LeaseOutcomeUpload = z.infer<typeof LeaseOutcomeUploadSchema>;
export type LeaseRenewRequest = z.infer<typeof LeaseRenewRequestSchema>;
export type LeaseFailureUpload = z.infer<typeof LeaseFailureUploadSchema>;
export type WorkItemUpsertRequest = z.infer<typeof WorkItemUpsertRequestSchema>;
export type WorkItemUpsertResult = z.infer<typeof WorkItemUpsertResultSchema>;
export type RuntimeExecutionRequest = z.infer<typeof RuntimeExecutionRequestSchema>;
export type RuntimeExecutionResult = z.infer<typeof RuntimeExecutionResultSchema>;
export type PiRuntimeConfig = z.infer<typeof PiRuntimeConfigSchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type SessionEventEnvelope = z.infer<typeof SessionEventEnvelopeSchema>;
