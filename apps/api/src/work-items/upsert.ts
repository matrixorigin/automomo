import { WorkItemUpsertRequest, WorkItemUpsertResultSchema } from "@automomo/protocol";
import { startSessionFromWorkItem } from "../sessions/start";
import { ControlPlaneStore } from "../store";

export function upsertWorkItemFromSource(input: {
  store: ControlPlaneStore;
  request: WorkItemUpsertRequest;
  now: string;
  idFactory?: (prefix: string) => string;
}) {
  if (!input.store.listCodebases().some((codebase) => codebase.id === input.request.codebaseId)) {
    throw new Error(`unknown codebase ${input.request.codebaseId}`);
  }
  const existing = input.store
    .listWorkItems()
    .find((item) => item.connector?.type === input.request.connector.type && connectorMatches(item.connector, input.request.connector));
  const idFactory = input.idFactory ?? defaultId;
  const created = existing === undefined;
  const workItem = input.store.saveWorkItem({
    id: existing?.id ?? idFactory("work"),
    codebaseId: input.request.codebaseId,
    title: input.request.title,
    body: input.request.body,
    source: input.request.source,
    status: existing?.status === "completed" ? existing.status : input.request.status,
    priority: input.request.priority,
    labels: input.request.labels,
    connector: input.request.connector,
    metadata: { ...existing?.metadata, ...input.request.metadata },
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now
  });
  const sessionStart =
    input.request.evaluateRules && workItem.status !== "completed"
      ? startSessionFromWorkItem({
          store: input.store,
          workItem,
          trigger: input.request.source === "webhook" ? "webhook" : input.request.source,
          now: input.now,
          idFactory
        })
      : undefined;

  return WorkItemUpsertResultSchema.parse({
    workItem: sessionStart?.workItem ?? workItem,
    created,
    sessionStart: sessionStart?.session ? sessionStart : undefined
  });
}

function connectorMatches(left: { id?: string; url?: string }, right: { id?: string; url?: string }) {
  return (left.id && right.id && left.id === right.id) || (left.url && right.url && left.url === right.url);
}

function defaultId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}
