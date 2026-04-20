import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const codebases = sqliteTable("codebases", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  sourceUrl: text("source_url"),
  defaultBranch: text("default_branch"),
  workspaceRoot: text("workspace_root"),
  status: text("status").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const workItems = sqliteTable("work_items", {
  id: text("id").primaryKey(),
  codebaseId: text("codebase_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  labelsJson: text("labels_json").notNull(),
  connectorJson: text("connector_json"),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const orchestrationRules = sqliteTable("orchestration_rules", {
  id: text("id").primaryKey(),
  codebaseId: text("codebase_id").notNull(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  trigger: text("trigger").notNull(),
  matchJson: text("match_json").notNull(),
  agentId: text("agent_id"),
  runtimeId: text("runtime_id"),
  humanApproval: text("human_approval").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  codebaseId: text("codebase_id").notNull(),
  workItemId: text("work_item_id"),
  agentId: text("agent_id"),
  runtimeId: text("runtime_id"),
  status: text("status").notNull(),
  participantsJson: text("participants_json").notNull(),
  leaseId: text("lease_id"),
  outcomeId: text("outcome_id"),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").notNull()
});

export const sessionEvents = sqliteTable("session_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  sequence: integer("sequence").notNull(),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  detail: text("detail"),
  actorJson: text("actor_json"),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull()
});

export const runtimes = sqliteTable("runtimes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mode: text("mode").notNull(),
  provider: text("provider").notNull(),
  environmentJson: text("environment_json").notNull(),
  status: text("status").notNull(),
  capacity: integer("capacity").notNull(),
  activeSessions: integer("active_sessions").notNull(),
  lastHeartbeatAt: text("last_heartbeat_at"),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  model: text("model"),
  instructions: text("instructions").notNull(),
  skillsJson: text("skills_json").notNull(),
  toolsJson: text("tools_json").notNull(),
  defaultRuntimeId: text("default_runtime_id"),
  maxConcurrency: integer("max_concurrency").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const outcomes = sqliteTable("outcomes", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  resultJson: text("result_json").notNull(),
  eventsUploaded: integer("events_uploaded").notNull(),
  createdAt: text("created_at").notNull()
});

export const humanHandoffs = sqliteTable("human_handoffs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  status: text("status").notNull(),
  reason: text("reason").notNull(),
  note: text("note").notNull(),
  claimedBy: text("claimed_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const daemons = sqliteTable("daemons", {
  id: text("id").primaryKey(),
  runtimeId: text("runtime_id").notNull(),
  name: text("name").notNull(),
  secretId: text("secret_id").notNull(),
  secret: text("secret").notNull(),
  signatureVersion: text("signature_version").notNull(),
  status: text("status").notNull(),
  lastSeenAt: text("last_seen_at"),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const runtimeLeases = sqliteTable("runtime_leases", {
  id: text("id").primaryKey(),
  runtimeId: text("runtime_id").notNull(),
  sessionId: text("session_id").notNull(),
  daemonId: text("daemon_id"),
  expiresAt: text("expires_at").notNull(),
  renewedAt: text("renewed_at"),
  completedAt: text("completed_at"),
  failedAt: text("failed_at"),
  createdAt: text("created_at").notNull()
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  scopesJson: text("scopes_json").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull()
});
