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

export function HandoffControls({ sessionId }: { sessionId: string }) {
  const endpoint = `/api/sessions/${sessionId}/handoff`;
  return (
    <div className="handoff-controls">
      <form data-json-endpoint={endpoint} onSubmit={submitJsonForm(endpoint, buildHandoffPayload)}>
        <input name="action" type="hidden" value="claim" />
        <button type="submit">Claim</button>
      </form>
      <form data-json-endpoint={endpoint} onSubmit={submitJsonForm(endpoint, buildHandoffPayload)}>
        <input name="action" type="hidden" value="resume" />
        <button type="submit">Resume</button>
      </form>
      <form data-json-endpoint={endpoint} onSubmit={submitJsonForm(endpoint, buildHandoffPayload)}>
        <input name="action" type="hidden" value="approve" />
        <button type="submit">Approve</button>
      </form>
      <form data-json-endpoint={endpoint} onSubmit={submitJsonForm(endpoint, buildHandoffPayload)}>
        <input name="action" type="hidden" value="reject" />
        <button type="submit">Reject</button>
      </form>
    </div>
  );
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
