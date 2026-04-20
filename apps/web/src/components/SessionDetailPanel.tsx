import { SessionDetailResponse } from "@automomo/protocol";
import React from "react";
import { HandoffControls } from "./HandoffControls";
import { SessionTimeline } from "./SessionTimeline";

export function SessionDetailPanel({ detail }: { detail: SessionDetailResponse }) {
  const participants = detail.session.participants.map((item) => item.name).join(" + ") || "No participants";
  return (
    <section className="detail-panel" id="outcomes">
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
      <HandoffControls sessionId={detail.session.id} />
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
