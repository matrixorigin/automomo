import {
  AgentSchema,
  CodebaseSchema,
  OrchestrationRuleSchema,
  RoomAgentCreateResponseSchema,
  RoomAgentSchema,
  RoomCreateResponseSchema,
  RoomListQuery,
  RoomListResponseSchema,
  RoomMessageCreateResponseSchema,
  RoomMessageSchema,
  RoomSchema,
  RoomTaskCreateResponseSchema,
  RoomTaskSchema,
  OverviewSchema,
  RuntimeSchema,
  SessionDetailResponseSchema,
  SessionListQuery,
  SessionListResponseSchema,
  WorkItemListQuery,
  WorkItemListResponseSchema
} from "@automomo/protocol";

export interface AutomomoApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export function createAutomomoApiClient(options: AutomomoApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? process.env.AUTOMOMO_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  async function get(path: string) {
    const response = await fetchImpl(`${baseUrl}${path}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`automomo API ${path} failed with ${response.status}`);
    }
    return response.json();
  }

  async function post(path: string, body: Record<string, unknown>) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`automomo API ${path} failed with ${response.status}`);
    }
    return response.json();
  }

  return {
    async getOverview() {
      return OverviewSchema.parse(await get("/api/overview"));
    },
    async listCodebases() {
      const payload = (await get("/api/codebases")) as { codebases: unknown[] };
      return payload.codebases.map((item) => CodebaseSchema.parse(item));
    },
    async listWorkItems(query: Partial<WorkItemListQuery> = {}) {
      return WorkItemListResponseSchema.parse(await get(`/api/work-items${serializeQuery(query)}`));
    },
    async listOrchestrationRules() {
      const payload = (await get("/api/orchestration-rules")) as { orchestrationRules: unknown[] };
      return payload.orchestrationRules.map((item) => OrchestrationRuleSchema.parse(item));
    },
    async listRooms(query: Partial<RoomListQuery> = {}) {
      return RoomListResponseSchema.parse(await get(`/api/rooms${serializeQuery(query)}`));
    },
    async listRoomAgents(roomId: string) {
      const payload = (await get(`/api/rooms/${roomId}/agents`)) as { roomAgents?: unknown[]; items?: unknown[] };
      const items = payload.roomAgents ?? payload.items ?? [];
      return items.map((item) => RoomAgentSchema.parse(item));
    },
    async listRoomMessages(roomId: string) {
      const payload = (await get(`/api/rooms/${roomId}/messages`)) as { roomMessages?: unknown[]; items?: unknown[] };
      const items = payload.roomMessages ?? payload.items ?? [];
      return items.map((item) => RoomMessageSchema.parse(item));
    },
    async listRoomTasks(roomId: string) {
      const payload = (await get(`/api/rooms/${roomId}/tasks`)) as { roomTasks?: unknown[]; items?: unknown[] };
      const items = payload.roomTasks ?? payload.items ?? [];
      return items.map((item) => RoomTaskSchema.parse(item));
    },
    async listSessions(query: Partial<SessionListQuery> = {}) {
      return SessionListResponseSchema.parse(await get(`/api/sessions${serializeQuery(query)}`));
    },
    async getSession(id: string) {
      return SessionDetailResponseSchema.parse(await get(`/api/sessions/${id}`));
    },
    async listAgents() {
      const payload = (await get("/api/agents")) as { agents: unknown[] };
      return payload.agents.map((item) => AgentSchema.parse(item));
    },
    async listRuntimes() {
      const payload = (await get("/api/runtimes")) as { runtimes: unknown[] };
      return payload.runtimes.map((item) => RuntimeSchema.parse(item));
    },
    async createAgent(body: Record<string, unknown>) {
      const payload = (await post("/api/agents", body)) as { agent: unknown };
      return AgentSchema.parse(payload.agent);
    },
    async createRuntime(body: Record<string, unknown>) {
      const payload = (await post("/api/runtimes", body)) as { runtime: unknown };
      return RuntimeSchema.parse(payload.runtime);
    },
    async createOrchestrationRule(body: Record<string, unknown>) {
      const payload = (await post("/api/orchestration-rules", body)) as { orchestrationRule: unknown };
      return OrchestrationRuleSchema.parse(payload.orchestrationRule);
    },
    async createRoom(body: Record<string, unknown>) {
      const payload = (await post("/api/rooms", body)) as { room: unknown };
      return RoomCreateResponseSchema.parse(payload).room;
    },
    async createRoomAgent(roomId: string, body: Record<string, unknown>) {
      const payload = (await post(`/api/rooms/${roomId}/agents`, body)) as { roomAgent: unknown };
      return RoomAgentCreateResponseSchema.parse(payload).roomAgent;
    },
    async createRoomMessage(roomId: string, body: Record<string, unknown>) {
      const payload = (await post(`/api/rooms/${roomId}/messages`, body)) as { roomMessage: unknown };
      return RoomMessageCreateResponseSchema.parse(payload).roomMessage;
    },
    async createRoomTask(roomId: string, body: Record<string, unknown>) {
      const payload = (await post(`/api/rooms/${roomId}/tasks`, body)) as { roomTask: unknown };
      return RoomTaskCreateResponseSchema.parse(payload).roomTask;
    }
  };
}

export function getApiClient() {
  return createAutomomoApiClient();
}

function serializeQuery(query: Record<string, unknown>) {
  const params = new URLSearchParams();
  const preferredOrder = [
    "codebaseId",
    "roomId",
    "source",
    "status",
    "assignee",
    "q",
    "limit",
    "offset",
    "agentId",
    "runtimeId",
    "participant",
    "createdAfter",
    "createdBefore",
    "updatedAfter",
    "updatedBefore"
  ];
  const keys = [...new Set([...preferredOrder, ...Object.keys(query)])];
  for (const key of keys) {
    const value = query[key];
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}
