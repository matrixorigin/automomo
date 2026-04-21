import React from "react";
import { SessionDetailResponse } from "@automomo/protocol";
import { EmptyState } from "./EmptyState";
import { Badge } from "./ui";

type RoomOutcomesPanelProps = {
  outcomes: SessionDetailResponse[];
};

export function RoomOutcomesPanel({ outcomes }: RoomOutcomesPanelProps) {
  const items = outcomes.filter((detail) => detail.outcome);
  if (items.length === 0) {
    return <EmptyState title="No outcomes yet" body="Session outcomes will be summarized here." />;
  }

  return (
    <section className="room-outcomes-panel" aria-label="Room outcomes">
      {items.map((detail) => {
        const outcome = detail.outcome;
        if (!outcome) {
          return null;
        }
        const sessionLabel = detail.session.id.toUpperCase();
        const workItemTitle = detail.workItem?.title ?? "No work item title";
        return (
          <article className="session-row" key={outcome.id}>
            <div>
              <strong>{workItemTitle}</strong>
              <a href={`#session-${detail.session.id}`}>{sessionLabel}</a>
            </div>
            <div>
              <Badge tone={outcomeTone(outcome.status)}>{outcome.status.replaceAll("_", " ")}</Badge>
              <p>{outcome.summary}</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function outcomeTone(status: NonNullable<SessionDetailResponse["outcome"]>["status"]) {
  if (status === "success") {
    return "green";
  }
  if (status === "failed") {
    return "red";
  }
  return "yellow";
}
