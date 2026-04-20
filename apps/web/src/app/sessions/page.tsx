import { AppShell } from "@/components/AppShell";
import { DataRow, DataRows } from "@/components/DataRows";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { agents, runtimes, sessionEvents, sessions, workItems } from "@/lib/mock-data";

export default function SessionsPage() {
  return (
    <AppShell active="Sessions">
      <WorkspaceHeader section="Sessions" title="Human and agent sessions" action="Open session" />
      <DataRows title="Live sessions" count={sessions.length}>
        {sessions.map((session) => {
          const workItem = workItems.find((item) => item.id === session.workItemId);
          const agent = agents.find((item) => item.id === session.agentId);
          const runtime = runtimes.find((item) => item.id === session.runtimeId);
          return (
            <DataRow
              key={session.id}
              tone={session.status === "needs_human" ? "yellow" : "green"}
              title={workItem?.title ?? session.id}
              subtitle={`${session.participants.map((item) => item.name).join(" + ")} on ${runtime?.name ?? "runtime"}`}
              code={session.id.toUpperCase()}
              status={session.status}
              meta={[
                { label: "Agent", value: agent?.name ?? "none", caption: "participant" },
                { label: "Runtime", value: runtime?.provider ?? "unknown", caption: runtime?.mode ?? "missing" }
              ]}
              action="Inspect"
            />
          );
        })}
      </DataRows>
      <section className="timeline" id="handoffs">
        <h2>Session timeline</h2>
        {sessionEvents.map((event) => (
          <article key={event.id}>
            <small>{event.kind}</small>
            <strong>{event.summary}</strong>
            <span>{event.detail}</span>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
