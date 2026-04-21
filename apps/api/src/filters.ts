import { RoomListQuerySchema, SessionListQuerySchema, WorkItemListQuerySchema } from "@automomo/protocol";

const knownWorkItemFilters = new Set([
  "codebaseId",
  "roomId",
  "source",
  "status",
  "assignee",
  "q",
  "createdAfter",
  "createdBefore",
  "updatedAfter",
  "updatedBefore",
  "limit",
  "offset"
]);

const knownSessionFilters = new Set([
  "status",
  "codebaseId",
  "roomId",
  "agentId",
  "runtimeId",
  "participant",
  "createdAfter",
  "createdBefore",
  "updatedAfter",
  "updatedBefore",
  "limit",
  "offset"
]);

const knownRoomFilters = new Set(["codebaseId", "status", "q", "limit", "offset"]);

export function parseWorkItemListQuery(url: string) {
  return WorkItemListQuerySchema.parse(searchParamsToObject(url, knownWorkItemFilters));
}

export function parseSessionListQuery(url: string) {
  return SessionListQuerySchema.parse(searchParamsToObject(url, knownSessionFilters));
}

export function parseRoomListQuery(url: string) {
  return RoomListQuerySchema.parse(searchParamsToObject(url, knownRoomFilters));
}

function searchParamsToObject(url: string, known: Set<string>) {
  const params = new URL(url).searchParams;
  const query: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (known.has(key) && value !== "") {
      query[key] = value;
    }
  }
  return query;
}
