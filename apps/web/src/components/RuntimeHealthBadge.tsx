import { RuntimeStatusSchema } from "@automomo/protocol";
import React from "react";

export function RuntimeHealthBadge({ status }: { status: string }) {
  const parsed = RuntimeStatusSchema.safeParse(status);
  const safeStatus = parsed.success ? parsed.data : "offline";
  return <span className={`status-pill status-${safeStatus}`}>{safeStatus}</span>;
}
