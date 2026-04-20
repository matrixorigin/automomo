"use client";

import React from "react";

export function HandoffControls({ sessionId }: { sessionId: string }) {
  return (
    <div className="handoff-controls">
      <form action={`/api/sessions/${sessionId}/handoff`} method="post">
        <input name="action" type="hidden" value="claim" />
        <button type="submit">Claim</button>
      </form>
      <form action={`/api/sessions/${sessionId}/resume`} method="post">
        <button type="submit">Resume</button>
      </form>
      <form action={`/api/sessions/${sessionId}/approve`} method="post">
        <button type="submit">Approve</button>
      </form>
      <form action={`/api/sessions/${sessionId}/reject`} method="post">
        <button type="submit">Reject</button>
      </form>
    </div>
  );
}
