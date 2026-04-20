import { AppShell } from "@/components/AppShell";
import { DataRow, DataRows } from "@/components/DataRows";
import { Totals } from "@/components/Totals";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { runtimes, sessions, workItems } from "@/lib/mock-data";

export default function OverviewPage() {
  return (
    <AppShell active="Overview">
      <WorkspaceHeader section="Overview" title="Shared codebase operations" action="Create work" />
      <Totals
        items={[
          { label: "Open", value: workItems.length, caption: "work items" },
          { label: "Running", value: sessions.filter((session) => session.status === "running").length, caption: "sessions" },
          { label: "Runtimes", value: runtimes.filter((runtime) => runtime.status !== "offline").length, caption: "online" }
        ]}
      />
      <DataRows title="Priority lane" count={workItems.length}>
        {workItems.map((item, index) => (
          <DataRow
            key={item.id}
            tone={index === 0 ? "green" : index === 1 ? "yellow" : "grey"}
            title={item.title}
            subtitle={item.body}
            code={item.id.toUpperCase()}
            status={item.status}
            meta={[
              { label: "Priority", value: item.priority, caption: item.source },
              { label: "Labels", value: item.labels.join(", ") || "none", caption: "routing" }
            ]}
          />
        ))}
      </DataRows>
    </AppShell>
  );
}
