import React from "react";
import type { Agent, Runtime, Session } from "@automomo/protocol";
import { getRoomRuntimeCandidates } from "./RoomRuntimePanel";
import { RuntimePresenceBadge } from "./RuntimePresenceBadge";

export function RoomRuntimePresence({
  runtimes,
  sessions,
  joinedAgents,
  codebaseWorkspaceRoot
}: {
  runtimes: Runtime[];
  sessions: Session[];
  joinedAgents: Agent[];
  codebaseWorkspaceRoot?: string;
}) {
  const candidates = getRoomRuntimeCandidates({
    runtimes,
    sessions,
    joinedAgents,
    codebaseWorkspaceRoot
  });
  const primaryRuntime = candidates[0]?.runtime;

  return <RuntimePresenceBadge runtime={primaryRuntime} />;
}
