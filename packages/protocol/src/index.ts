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

export const WorkItemSourceSchema = z.enum(["manual", "api", "webhook", "schedule", "sync"]);
export const WorkItemStatusSchema = z.enum([
  "open",
  "ready",
  "running",
  "needs_human",
  "completed",
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

export const HumanHandoffSchema = z.object({
  id: IdSchema,
  sessionId: IdSchema,
  status: z.enum(["requested", "claimed", "responded", "resumed"]).default("requested"),
  reason: z.string().trim().min(1),
  note: z.string().default(""),
  claimedBy: z.string().trim().min(1).optional(),
  createdAt: ISODateString,
  updatedAt: ISODateString
});

export const DaemonRegistrationSchema = z.object({
  runtimeId: IdSchema.optional(),
  name: z.string().trim().min(1),
  provider: RuntimeProviderSchema.default("pi"),
  environment: RuntimeEnvironmentSchema.default({})
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

export const SessionEventEnvelopeSchema = z.object({
  type: z.literal("session.event"),
  version: z.literal(1),
  payload: SessionEventSchema
});

export type Codebase = z.infer<typeof CodebaseSchema>;
export type WorkItem = z.infer<typeof WorkItemSchema>;
export type OrchestrationRule = z.infer<typeof OrchestrationRuleSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type SessionEvent = z.infer<typeof SessionEventSchema>;
export type Runtime = z.infer<typeof RuntimeSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
export type HumanHandoff = z.infer<typeof HumanHandoffSchema>;
export type DaemonRegistration = z.infer<typeof DaemonRegistrationSchema>;
export type RuntimeHeartbeat = z.infer<typeof RuntimeHeartbeatSchema>;
export type LeaseRequest = z.infer<typeof LeaseRequestSchema>;
export type Lease = z.infer<typeof LeaseSchema>;
export type LeaseResponse = z.infer<typeof LeaseResponseSchema>;
export type LeaseEventUpload = z.infer<typeof LeaseEventUploadSchema>;
export type LeaseOutcomeUpload = z.infer<typeof LeaseOutcomeUploadSchema>;
export type SessionEventEnvelope = z.infer<typeof SessionEventEnvelopeSchema>;
