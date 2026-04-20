import { OrchestrationTrigger, SessionStartResultSchema, WorkItem } from "@automomo/protocol";
import { evaluateOrchestrationRules } from "../orchestration/evaluator";
import { ControlPlaneStore } from "../store";

export function startSessionFromWorkItem(input: {
  store: ControlPlaneStore;
  workItem: WorkItem;
  trigger: OrchestrationTrigger;
  now: string;
  idFactory?: (prefix: string) => string;
}) {
  const evaluation = evaluateOrchestrationRules({
    rules: input.store.listOrchestrationRules(),
    workItem: input.workItem,
    trigger: input.trigger
  });
  if (!evaluation.matched) {
    return SessionStartResultSchema.parse({ evaluation });
  }
  const existingSession = input.store
    .listSessions()
    .find((session) => session.workItemId === input.workItem.id && !["completed", "failed", "cancelled"].includes(session.status));
  if (existingSession) {
    return SessionStartResultSchema.parse({ evaluation, session: existingSession, workItem: input.workItem });
  }

  const agent = evaluation.agentId ? input.store.getAgent(evaluation.agentId) : undefined;
  const runtimeId = evaluation.runtimeId ?? agent?.defaultRuntimeId;
  const status = evaluation.requiresHumanApproval ? "needs_human" : "queued";
  const workItem = input.store.saveWorkItem({
    ...input.workItem,
    status: evaluation.requiresHumanApproval ? "needs_human" : "ready",
    updatedAt: input.now
  });
  const id = (input.idFactory ?? defaultId)("session");
  const session = input.store.saveSession({
    id,
    codebaseId: workItem.codebaseId,
    workItemId: workItem.id,
    agentId: evaluation.agentId,
    runtimeId,
    status,
    participants: agent ? [{ type: "agent", id: agent.id, name: agent.name }] : [],
    metadata: {
      orchestration: {
        ruleId: evaluation.ruleId,
        reason: evaluation.reason,
        trigger: input.trigger
      }
    },
    createdAt: input.now,
    updatedAt: input.now
  });

  return SessionStartResultSchema.parse({ evaluation, session, workItem });
}

function defaultId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}
