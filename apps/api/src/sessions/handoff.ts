import { HandoffAction, HumanHandoff, SessionEvent } from "@automomo/protocol";
import { ControlPlaneStore } from "../store";

const statusByAction: Record<HandoffAction["action"], HumanHandoff["status"]> = {
  request: "requested",
  claim: "claimed",
  respond: "responded",
  resume: "resumed",
  approve: "approved",
  reject: "rejected",
  complete: "completed"
};

export function applyHandoffAction(input: {
  store: ControlPlaneStore;
  sessionId: string;
  action: HandoffAction;
  now: string;
  idFactory?: (prefix: string) => string;
}) {
  const session = input.store.getSession(input.sessionId);
  if (!session) {
    return undefined;
  }
  const idFactory = input.idFactory ?? defaultId;
  const status = statusByAction[input.action.action];
  const handoff = input.store.saveHandoff({
    id: idFactory("handoff"),
    sessionId: input.sessionId,
    status,
    reason: input.action.reason ?? defaultReason(input.action.action),
    note: input.action.note,
    claimedBy: input.action.claimedBy,
    createdAt: input.now,
    updatedAt: input.now
  });
  const sequence = input.store.listSessionEvents(input.sessionId).length;
  const event: SessionEvent = {
    id: idFactory("event"),
    sessionId: input.sessionId,
    sequence,
    kind: "handoff",
    summary: `Handoff ${status}`,
    detail: input.action.note || input.action.reason,
    actor: input.action.claimedBy ? { type: "human", name: input.action.claimedBy } : undefined,
    metadata: input.action.metadata,
    createdAt: input.now
  };
  const events = input.store.appendSessionEvents(input.sessionId, [event]);
  const nextStatus =
    status === "claimed"
      ? "claimed_by_human"
      : status === "resumed" || status === "approved" || status === "responded"
        ? "resumed_by_agent"
        : status === "rejected"
          ? "failed"
          : status === "completed"
            ? "completed"
            : "needs_human";
  input.store.updateSession(input.sessionId, {
    status: nextStatus,
    updatedAt: input.now,
    completedAt: nextStatus === "completed" || nextStatus === "failed" ? input.now : session.completedAt
  });

  return { handoff, session: input.store.getSession(input.sessionId), events };
}

function defaultReason(action: HandoffAction["action"]) {
  return `Handoff ${action}`;
}

function defaultId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}
