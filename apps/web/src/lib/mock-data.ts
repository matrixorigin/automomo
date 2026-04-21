import {
  Agent,
  Codebase,
  OrchestrationRule,
  Room,
  RoomAgent,
  RoomMessage,
  RoomTask,
  Runtime,
  Session,
  SessionEvent,
  WorkItem
} from "@automomo/protocol";

const now = "2026-04-20T08:00:00.000Z";

export const codebases: Codebase[] = [
  {
    id: "codebase_automomo",
    name: "automomo",
    provider: "git",
    sourceUrl: "https://github.com/matrixorigin/automomo",
    defaultBranch: "main",
    status: "active",
    metadata: {},
    createdAt: now,
    updatedAt: now
  }
];

export const runtimes: Runtime[] = [
  {
    id: "runtime_local_pi",
    name: "Local Pi runtime",
    mode: "local",
    provider: "pi",
    environment: {
      workspaceRoot: "/Users/randomradio/src/mo/automomo",
      memoryMB: 4096,
      cpus: 4,
      networkPolicy: "restricted",
      env: {},
      secretRefs: []
    },
    status: "online",
    capacity: 2,
    activeSessions: 1,
    lastHeartbeatAt: now,
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: "runtime_daemon_box",
    name: "Remote BoxLite daemon",
    mode: "remote_daemon",
    provider: "boxlite",
    environment: {
      workspaceRoot: "~/src/customer-codebase",
      memoryMB: 8192,
      cpus: 6,
      networkPolicy: "restricted",
      env: {},
      secretRefs: ["github-token"]
    },
    status: "busy",
    capacity: 3,
    activeSessions: 2,
    lastHeartbeatAt: now,
    metadata: {},
    createdAt: now,
    updatedAt: now
  }
];

export const agents: Agent[] = [
  {
    id: "agent_ralph",
    name: "Ralph",
    model: "gpt-5.4",
    instructions: "Investigate carefully, ask for human handoff when runtime context is incomplete.",
    skills: ["repo-research", "code-review"],
    tools: ["shell", "git", "pi-runtime"],
    defaultRuntimeId: "runtime_local_pi",
    maxConcurrency: 1,
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: "agent_nova",
    name: "Nova",
    model: "gpt-5.4-mini",
    instructions: "Handle narrow implementation and verification tasks.",
    skills: ["frontend", "contracts"],
    tools: ["shell", "browser"],
    defaultRuntimeId: "runtime_daemon_box",
    maxConcurrency: 2,
    metadata: {},
    createdAt: now,
    updatedAt: now
  }
];

export const workItems: WorkItem[] = [
  {
    id: "work_1042",
    codebaseId: "codebase_automomo",
    roomId: "room_shared",
    title: "Reconnect race in realtime queue",
    body: "Preserve session event order and reconnect behavior when a runtime lease resumes.",
    source: "manual",
    status: "needs_human",
    priority: "urgent",
    labels: ["runtime", "realtime"],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: "work_291",
    codebaseId: "codebase_automomo",
    roomId: "room_handoff",
    title: "Auth guard empty-state clarity",
    body: "Keep runtime status visible when a human needs to reconnect credentials.",
    source: "api",
    status: "running",
    priority: "high",
    labels: ["ui", "handoff"],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: "work_987",
    codebaseId: "codebase_automomo",
    roomId: "room_shared",
    title: "Shared runtime for high-signal work",
    body: "Make the workspace feel like a working schedule, not a review card wall.",
    source: "manual",
    status: "ready",
    priority: "medium",
    labels: ["prototype"],
    metadata: {},
    createdAt: now,
    updatedAt: now
  }
];

export const rooms: Room[] = [
  {
    id: "room_shared",
    codebaseId: "codebase_automomo",
    name: "Shared room",
    description: "Working room for implementation and review",
    status: "active",
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: "room_handoff",
    codebaseId: "codebase_automomo",
    name: "Human checkpoint",
    description: "Room for questions and approvals",
    status: "active",
    metadata: {},
    createdAt: now,
    updatedAt: now
  }
];

export const roomAgents: RoomAgent[] = [
  {
    id: "room_agent_1",
    roomId: "room_shared",
    agentId: "agent_ralph",
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: "room_agent_2",
    roomId: "room_shared",
    agentId: "agent_nova",
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: "room_agent_3",
    roomId: "room_handoff",
    agentId: "agent_ralph",
    metadata: {},
    createdAt: now,
    updatedAt: now
  }
];

export const roomMessages: RoomMessage[] = [
  {
    id: "room_message_1",
    roomId: "room_shared",
    author: { type: "agent", agentId: "agent_ralph", name: "Ralph" },
    body: "I am mapping the reconnect flow and keeping the room updated.",
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: "room_message_2",
    roomId: "room_shared",
    author: { type: "system", name: "Scheduler" },
    body: "Nova picked up the compact UI pass.",
    metadata: {},
    createdAt: now,
    updatedAt: now
  }
];

export const roomTasks: RoomTask[] = [
  {
    id: "room_task_1",
    roomId: "room_shared",
    title: "Draft patch",
    body: "Break the room work into API, store, and UI passes.",
    status: "running",
    assignedAgentId: "agent_nova",
    workItemId: "work_987",
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: "room_task_2",
    roomId: "room_shared",
    title: "Verify membership counts",
    body: "Keep the room roster aligned with the agent list.",
    status: "open",
    assignedAgentId: "agent_ralph",
    workItemId: "work_291",
    metadata: {},
    createdAt: now,
    updatedAt: now
  }
];

export const sessions: Session[] = [
  {
    id: "session_alpha",
    codebaseId: "codebase_automomo",
    roomId: "room_shared",
    workItemId: "work_1042",
    agentId: "agent_ralph",
    runtimeId: "runtime_local_pi",
    status: "needs_human",
    participants: [
      { type: "agent", id: "agent_ralph", name: "Ralph" },
      { type: "human", name: "Random Radio" }
    ],
    metadata: {},
    createdAt: now,
    startedAt: now,
    updatedAt: now
  },
  {
    id: "session_beta",
    codebaseId: "codebase_automomo",
    roomId: "room_handoff",
    workItemId: "work_291",
    agentId: "agent_nova",
    runtimeId: "runtime_daemon_box",
    status: "running",
    participants: [{ type: "agent", id: "agent_nova", name: "Nova" }],
    leaseId: "lease_beta",
    metadata: {},
    createdAt: now,
    startedAt: now,
    updatedAt: now
  }
];

export const sessionEvents: SessionEvent[] = [
  {
    id: "event_1",
    sessionId: "session_alpha",
    sequence: 0,
    kind: "runtime",
    summary: "Local Pi runtime accepted session",
    detail: "Workspace mounted with restricted network policy.",
    actor: { type: "agent", id: "agent_ralph", name: "Ralph" },
    metadata: {},
    createdAt: now
  },
  {
    id: "event_2",
    sessionId: "session_alpha",
    sequence: 1,
    kind: "handoff",
    summary: "Human confirmation requested",
    detail: "Runtime needs approval before patching the websocket reconnect path.",
    actor: { type: "agent", id: "agent_ralph", name: "Ralph" },
    metadata: {},
    createdAt: now
  }
];

export const orchestrationRules: OrchestrationRule[] = [
  {
    id: "rule_runtime_risk",
    codebaseId: "codebase_automomo",
    name: "Runtime-risk work needs a human checkpoint",
    enabled: true,
    trigger: "manual",
    match: { labels: ["runtime"], priority: ["urgent", "high"] },
    agentId: "agent_ralph",
    runtimeId: "runtime_local_pi",
    humanApproval: "on_risk",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "rule_ui_polish",
    codebaseId: "codebase_automomo",
    name: "UI polish can start on remote daemon",
    enabled: true,
    trigger: "api",
    match: { labels: ["ui", "prototype"] },
    agentId: "agent_nova",
    runtimeId: "runtime_daemon_box",
    humanApproval: "before_result",
    createdAt: now,
    updatedAt: now
  }
];
