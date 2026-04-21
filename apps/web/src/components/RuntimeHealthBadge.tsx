import { Runtime, RuntimeStatusSchema } from "@automomo/protocol";
import React from "react";
import { Badge } from "./ui";
import type { BadgeTone } from "./ui/Badge";

export function RuntimeHealthBadge({ status }: { status: string }) {
  const parsed = RuntimeStatusSchema.safeParse(status);
  const safeStatus = parsed.success ? parsed.data : "offline";
  return (
    <Badge tone={runtimeStatusTone(safeStatus)} className={`status-pill status-${safeStatus}`}>
      {safeStatus}
    </Badge>
  );
}

function runtimeStatusTone(status: Runtime["status"]): BadgeTone {
  if (status === "online") {
    return "green";
  }
  if (status === "busy") {
    return "yellow";
  }
  if (status === "idle") {
    return "blue";
  }
  if (status === "unhealthy") {
    return "red";
  }
  return "neutral";
}
