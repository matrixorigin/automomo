import { SessionListQuerySchema, WorkItemListQuerySchema } from "@automomo/protocol";

const knownWorkItemFilters = new Set([
  "codebaseId",
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

export function parseWorkItemListQuery(url: string) {
  return WorkItemListQuerySchema.parse(searchParamsToObject(url, knownWorkItemFilters));
}

export function parseSessionListQuery(url: string) {
  return SessionListQuerySchema.parse(searchParamsToObject(url, knownSessionFilters));
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
