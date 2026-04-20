import { AppShell } from "@/components/AppShell";
import { DataRow, DataRows } from "@/components/DataRows";
import { Totals } from "@/components/Totals";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { runtimes } from "@/lib/mock-data";

export default function RuntimesPage() {
  return (
    <AppShell active="Runtimes">
      <WorkspaceHeader section="Runtimes" title="Reusable code and environment" action="Pair daemon" />
      <Totals
        items={[
          { label: "Online", value: runtimes.filter((runtime) => runtime.status === "online").length, caption: "available" },
          { label: "Busy", value: runtimes.filter((runtime) => runtime.status === "busy").length, caption: "leased" },
          { label: "Capacity", value: runtimes.reduce((sum, runtime) => sum + runtime.capacity, 0), caption: "sessions" }
        ]}
      />
      <DataRows title="Runtime inventory" count={runtimes.length}>
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
