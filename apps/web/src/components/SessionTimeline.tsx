import { SessionEvent } from "@automomo/protocol";
import React from "react";

export function SessionTimeline({ events }: { events: SessionEvent[] }) {
  return (
    <section className="timeline" id="handoffs">
      <h2>Session timeline</h2>
      {events.map((event) => (
        <article key={event.id}>
          <small>{event.kind}</small>
          <strong>{event.summary}</strong>
          <span>{event.detail}</span>
        </article>
      ))}
    </section>
  );
}
