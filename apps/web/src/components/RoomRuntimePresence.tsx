import React from "react";
import type { Runtime, Session } from "@automomo/protocol";

export function RoomRuntimePresence({
  runtimes,
  sessions
}: {
  runtimes: Runtime[];
  sessions: Session[];
}) {
  const onlineCount = runtimes.filter((runtime) => runtime.status === "online" || runtime.status === "busy").length;
  const busyCount = runtimes.filter((runtime) => runtime.status === "busy").length;
  const activeSessionCount = sessions.filter((session) => isActiveSession(session.status)).length;

  return (
    <p className="room-runtime-presence">
      Runtime presence: {onlineCount} online, {busyCount} busy, {activeSessionCount} active sessions
    </p>
  );
}

function isActiveSession(status: Session["status"]) {
  return status === "queued" || status === "leased" || status === "running" || status === "needs_human" || status === "claimed_by_human" || status === "resumed_by_agent";
}
