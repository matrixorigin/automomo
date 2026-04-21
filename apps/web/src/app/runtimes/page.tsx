import { AppShell } from "../../components/AppShell";
import { DataRow, DataRows } from "../../components/DataRows";
import { EmptyState } from "../../components/EmptyState";
import { RuntimeEditor } from "../../components/RuntimeEditor";
import { Totals } from "../../components/Totals";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { getApiClient } from "../../lib/api";
import React from "react";

export const dynamic = "force-dynamic";

export default async function RuntimesPage() {
  const api = getApiClient();
  const [overview, runtimes, rooms, agents] = await Promise.all([
    api.getOverview(),
    api.listRuntimes(),
    api.listRooms(),
    api.listAgents()
  ]);
  return (
    <AppShell active="Runtimes" overview={overview} rooms={rooms.items} agents={agents}>
      <WorkspaceHeader section="Runtimes" title="Reusable code environments" />
      <section className="schedule">
        <RuntimeEditor />
      </section>
      <Totals
        items={[
          { label: "Online", value: runtimes.filter((runtime) => runtime.status === "online").length, caption: "available" },
          { label: "Busy", value: runtimes.filter((runtime) => runtime.status === "busy").length, caption: "leased" },
          { label: "Capacity", value: runtimes.reduce((sum, runtime) => sum + runtime.capacity, 0), caption: "sessions" }
        ]}
      />
      <DataRows title="Runtime inventory" count={runtimes.length}>
        {runtimes.length === 0 ? <EmptyState title="No runtimes" body="Add reusable code environments for room sessions." /> : null}
        {runtimes.map((runtime) => (
          <DataRow
            key={runtime.id}
            tone={runtime.status === "busy" ? "yellow" : "green"}
            title={runtime.name}
            subtitle={`${runtime.mode.replaceAll("_", " ")} runtime with ${runtime.environment.networkPolicy} network policy`}
            code={runtime.id.toUpperCase()}
            status={runtime.status}
            meta={[
              { label: "Provider", value: runtime.provider, caption: "adapter" },
              { label: "Usage", value: `${runtime.activeSessions}/${runtime.capacity}`, caption: "sessions" }
            ]}
            action="Inspect"
          />
        ))}
      </DataRows>
    </AppShell>
  );
}
