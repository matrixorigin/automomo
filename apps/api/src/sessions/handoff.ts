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

export class HandoffTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandoffTransitionError";
  }
}

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
  assertTransition(input.store.listHandoffs(input.sessionId), input.action);
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

function assertTransition(handoffs: HumanHandoff[], action: HandoffAction) {
  const latest = handoffs.at(-1);
  switch (action.action) {
    case "request":
      if (latest && !["resumed", "rejected", "completed"].includes(latest.status)) {
        throw new HandoffTransitionError(`cannot request handoff after ${latest.status}`);
      }
      return;
    case "claim":
      if (latest?.status !== "requested") {
        throw new HandoffTransitionError("handoff must be requested before claim");
      }
      return;
    case "respond":
      if (latest?.status !== "claimed") {
        throw new HandoffTransitionError("handoff must be claimed before response");
      }
      return;
    case "resume":
      if (latest?.status !== "responded" && latest?.status !== "approved") {
        throw new HandoffTransitionError("handoff must be responded or approved before resume");
      }
      return;
    case "approve":
      if (!latest || !["requested", "claimed", "responded"].includes(latest.status)) {
        throw new HandoffTransitionError("handoff must be active before approval");
      }
      return;
    case "reject":
      if (!latest || !["requested", "claimed", "responded"].includes(latest.status)) {
        throw new HandoffTransitionError("handoff must be active before rejection");
      }
      return;
    case "complete":
      if (latest?.status !== "resumed" && latest?.status !== "approved") {
        throw new HandoffTransitionError("handoff must be resumed or approved before completion");
      }
      return;
  }
}

function defaultReason(action: HandoffAction["action"]) {
  return `Handoff ${action}`;
}

function defaultId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}
