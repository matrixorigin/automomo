import { Overview } from "@automomo/protocol";
import Link from "next/link";
import React from "react";

export function StatusStrip({ overview }: { overview?: Overview }) {
  const runtimeHealth = overview
    ? `${overview.runtimeHealth.online ?? 0} online / ${overview.runtimeHealth.busy ?? 0} busy`
    : "Runtime health pending";
  return (
    <div className="status-strip">
      <span>
        <strong>Runtime health</strong>
        {runtimeHealth}
      </span>
      <span>
        <strong>Daemons</strong>
        {overview?.daemonCount ?? 0}
      </span>
      <span>
        <strong>Active sessions</strong>
        {overview?.activeSessionCount ?? 0}
      </span>
      <span>
        <strong>Human handoffs</strong>
        {overview?.handoffCount ?? 0}
      </span>
      <Link href="/runtimes">View runtimes</Link>
    </div>
  );
}
