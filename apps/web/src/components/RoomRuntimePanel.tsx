import React from "react";
import type { Agent, Runtime, Session } from "@automomo/protocol";
import { EmptyState } from "./EmptyState";
import { RuntimeHealthBadge } from "./RuntimeHealthBadge";

type RuntimeCandidateSource = "session" | "agent_default" | "workspace_root";

type RuntimeCandidate = {
  runtime: Runtime;
  source: RuntimeCandidateSource;
};

type GetRoomRuntimeCandidatesOptions = {
  runtimes: Runtime[];
  sessions: Session[];
  joinedAgents: Agent[];
  codebaseWorkspaceRoot?: string;
};

export function getRoomRuntimeCandidates({
  runtimes,
  sessions,
  joinedAgents,
  codebaseWorkspaceRoot
}: GetRoomRuntimeCandidatesOptions): RuntimeCandidate[] {
  const runtimesById = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
  const candidates: RuntimeCandidate[] = [];
  const seenRuntimeIds = new Set<string>();

  const addRuntime = (runtimeId: string | undefined, source: RuntimeCandidateSource) => {
    if (!runtimeId || seenRuntimeIds.has(runtimeId)) {
      return;
    }
    const runtime = runtimesById.get(runtimeId);
    if (!runtime) {
      return;
    }
    seenRuntimeIds.add(runtimeId);
    candidates.push({ runtime, source });
  };

  for (const session of sessions) {
    addRuntime(session.runtimeId, "session");
  }

  for (const agent of joinedAgents) {
    addRuntime(agent.defaultRuntimeId, "agent_default");
  }

  if (codebaseWorkspaceRoot) {
    for (const runtime of runtimes) {
      if (runtime.environment.workspaceRoot === codebaseWorkspaceRoot) {
        addRuntime(runtime.id, "workspace_root");
      }
    }
  }

  return candidates;
}

export function RoomRuntimePanel({
  runtimes,
  sessions,
  joinedAgents,
  codebaseWorkspaceRoot
}: GetRoomRuntimeCandidatesOptions) {
  const candidates = getRoomRuntimeCandidates({ runtimes, sessions, joinedAgents, codebaseWorkspaceRoot });
  if (candidates.length === 0) {
    return <EmptyState title="No runtime attached" body="Attach a runtime through room sessions, agent defaults, or codebase workspace setup." />;
  }

  return (
    <section className="room-runtime-panel" aria-label="Room runtime">
      <div className="floor-heading">
        <h2>
          Runtime context <span>{candidates.length}</span>
        </h2>
      </div>

      <div className="room-runtime-cards">
        {candidates.map((candidate) => {
          const runtime = candidate.runtime;
          const heartbeat = runtime.lastHeartbeatAt ? formatHeartbeat(runtime.lastHeartbeatAt) : undefined;
          return (
            <article className="room-runtime-card" key={runtime.id}>
              <header>
                <strong>{runtime.name}</strong>
                <span>{runtime.id.toUpperCase()}</span>
              </header>
              <div className="room-runtime-card-row">
                <span>
                  {getRuntimeModeLabel(runtime.mode)} · {getRuntimeProviderLabel(runtime.provider)}
                </span>
                <RuntimeHealthBadge status={runtime.status} />
              </div>
              <div className="room-runtime-card-row">
                <span>{runtime.activeSessions} active sessions</span>
                {heartbeat ? <span>Heartbeat {heartbeat}</span> : null}
              </div>
              {runtime.mode !== "hosted" && runtime.environment.workspaceRoot ? (
                <p className="room-runtime-workspace-root">{runtime.environment.workspaceRoot}</p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function getRuntimeModeLabel(mode: Runtime["mode"]) {
  if (mode === "local") {
    return "Local";
  }
  if (mode === "remote_daemon") {
    return "Remote daemon";
  }
  return "Hosted";
}

export function getRuntimeProviderLabel(provider: Runtime["provider"]) {
  if (provider === "pi") {
    return "Pi";
  }
  if (provider === "open_code") {
    return "OpenCode";
  }
  return provider
    .split("_")
    .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatHeartbeat(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC"
  });
}
