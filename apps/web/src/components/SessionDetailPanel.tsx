import { SessionDetailResponse } from "@automomo/protocol";
import React from "react";
import { HandoffControls } from "./HandoffControls";
import { SessionTimeline } from "./SessionTimeline";

export function SessionDetailPanel({ detail, className }: { detail: SessionDetailResponse; className?: string }) {
  const participants = detail.session.participants.map((item) => item.name).join(" + ") || "No participants";
  const latestHandoff = detail.handoffs.at(-1);
  return (
    <section className={["detail-panel", className].filter(Boolean).join(" ")} id="outcomes">
      <header>
        <small>{detail.session.status.replaceAll("_", " ")}</small>
        <h2>{detail.workItem?.title ?? detail.session.id}</h2>
        <span>{participants}</span>
      </header>
      <dl>
        <div>
          <dt>Agent</dt>
          <dd>{detail.agent?.name ?? "Unassigned"}</dd>
        </div>
        <div>
          <dt>Runtime</dt>
          <dd>{detail.runtime?.name ?? "No runtime"}</dd>
        </div>
        <div>
          <dt>Outcome</dt>
          <dd>{detail.outcome?.summary ?? "Pending"}</dd>
        </div>
      </dl>
      <HandoffControls sessionId={detail.session.id} latestStatus={latestHandoff?.status} />
      <div className="handoff-list">
        {detail.handoffs.map((handoff) => (
          <span key={handoff.id}>
            {handoff.status}: {handoff.reason}
          </span>
        ))}
      </div>
      <SessionTimeline events={detail.events} />
    </section>
  );
}
