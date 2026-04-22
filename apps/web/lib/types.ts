export type HarnessType = "codex" | "claude-code" | "gemini-cli" | "automomo-daemon" | "openclaw" | "custom"
export type AgentStatus = "idle" | "running" | "error"
export type AuthorType = "human" | "agent"
export type ArtifactType = "plan" | "patch" | "review" | "pr" | "document" | "log"
export type TaskStatus = "backlog" | "in_progress" | "done"
export type TaskPriority = "low" | "medium" | "high"
export type WorkspaceRole = "OWNER" | "MEMBER"

export interface Room {
  id: string
  codebaseId?: string | null
  name: string
  description: string
  paused?: boolean
  publicShareId?: string | null
  createdAt: string
  agents?: AgentSummary[]
}

export interface AgentSummary {
  id: string
  name: string
  color: string
  icon: string
  status: AgentStatus
  activeRoomId?: string | null
  role?: string
  description?: string
  defaultEnvironmentId?: string | null
  environment?: Environment | null
}

export interface Agent {
  id: string
  name: string
  role: string
  description: string
  color: string
  icon: string
  repoUrl: string
  harness: HarnessType
  environmentId: string
  runtimeId?: string | null
  defaultEnvironmentId?: string | null
  instructions: string
  systemPrompt: string
  openclawConfig: {
    pollIntervalSeconds: number
    maxMentionsPerPoll: number
    contextMessageCount: number
    leaseSeconds: number
  }
  hasAgentToken?: boolean
  agentTokenPreview?: string | null
  skills: string[]
  mcpServers: string[]
  scripts: string[]
  status: AgentStatus
  createdAt: string
  environment?: Environment | null
}

export interface Environment {
  id: string
  workspaceId?: string | null
  codebaseId?: string | null
  name: string
  kind: "local" | "hosted"
  workspaceRoot?: string
  command: "pi"
  status: "offline" | "online" | "busy" | "unhealthy"
  capacity: number
  activeRuns: number
  lastHeartbeatAt?: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  roomId: string
  authorId: string
  authorType: AuthorType
  content: string
  sessionUrl?: string | null
  timestamp: string
  author?: AgentSummary
  user?: {
    id: string
    name: string
  } | null
}

export interface Artifact {
  id: string
  roomId: string
  type: ArtifactType | "sheet" | string
  title: string
  content: string
  url?: string | null
  createdBy?: string | null
  userId?: string | null
  runId?: string | null
  environmentId?: string | null
  taskId?: string | null
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt?: string
  agent?: AgentSummary | null
}

export interface Task {
  id: string
  roomId: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assigneeId?: string | null
  createdBy?: string | null
  createdAt: string
  updatedAt: string
  assignee?: AgentSummary | null
  creator?: AgentSummary | null
}

export interface Notification {
  id: string
  roomId: string
  agentId: string
  message: string
  read: boolean
  timestamp: string
  room?: { name: string }
  agent?: AgentSummary
}

export interface Workspace {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  role: WorkspaceRole
  currentUserId: string
}

export interface WorkspaceMember {
  userId: string
  role: WorkspaceRole
  invitedByUserId?: string | null
  createdAt: string
  user: {
    id: string
    name: string
    email: string
  }
}

export interface WorkspaceInvite {
  id: string
  workspaceId: string
  createdByUserId: string
  role: WorkspaceRole
  createdAt: string
  acceptedAt?: string | null
  expiresAt?: string | null
  inviteUrl?: string
}
