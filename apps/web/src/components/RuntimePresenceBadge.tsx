import React from "react";
import type { Runtime } from "@automomo/protocol";
import { RuntimeHealthBadge } from "./RuntimeHealthBadge";
import { getRuntimeModeLabel, getRuntimeProviderLabel } from "./RoomRuntimePanel";

export function RuntimePresenceBadge({ runtime }: { runtime?: Runtime }) {
  if (!runtime) {
    return (
      <p className="room-runtime-presence">
        <span>No runtime</span>
      </p>
    );
  }

  return (
    <p className="room-runtime-presence">
      <span>
        {getRuntimeModeLabel(runtime.mode)} · {getRuntimeProviderLabel(runtime.provider)}
      </span>
      <RuntimeHealthBadge status={runtime.status} />
      <span>{runtime.activeSessions} sessions</span>
    </p>
  );
}
