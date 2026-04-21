"use client";

import React from "react";
import { optionalString, submitJsonForm } from "./jsonSubmit";

export function buildHandoffPayload(formData: FormData) {
  return compact({
    action: optionalString(formData.get("action")) ?? "request",
    reason: optionalString(formData.get("reason")),
    note: optionalString(formData.get("note")) ?? "",
    claimedBy: optionalString(formData.get("claimedBy"))
  });
}

export function HandoffControls({ sessionId, latestStatus }: { sessionId: string; latestStatus?: string }) {
  const endpoint = `/api/sessions/${sessionId}/handoff`;
  const actions = actionsForStatus(latestStatus);
  return (
    <div className="handoff-controls">
      {actions.map((action) => (
        <form data-json-endpoint={endpoint} key={action.value} onSubmit={submitJsonForm(endpoint, buildHandoffPayload)}>
          <input name="action" type="hidden" value={action.value} />
          <button type="submit">{action.label}</button>
        </form>
      ))}
    </div>
  );
}

function actionsForStatus(status?: string) {
  if (!status || ["resumed", "approved", "rejected", "completed"].includes(status)) {
    return [{ value: "request", label: "Request handoff" }];
  }
  if (status === "requested") {
    return [
      { value: "claim", label: "Claim" },
      { value: "approve", label: "Approve" },
      { value: "reject", label: "Reject" }
    ];
  }
  if (status === "claimed" || status === "responded") {
    return [
      { value: "approve", label: "Approve" },
      { value: "reject", label: "Reject" }
    ];
  }
  return [{ value: "request", label: "Request handoff" }];
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
