import { AppShell } from "@/components/AppShell";
import { DataRow, DataRows } from "@/components/DataRows";
import { EmptyState } from "@/components/EmptyState";
import { Totals } from "@/components/Totals";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { getApiClient } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const api = getApiClient();
  const [overview, workItems] = await Promise.all([api.getOverview(), api.listWorkItems({ limit: 5 })]);
  return (
    <AppShell active="Overview" overview={overview}>
      <WorkspaceHeader section="Overview" title="Shared codebase operations" action="Create work" />
      <Totals
        items={[
          { label: "Open", value: overview.counts.workItems, caption: "work items" },
          { label: "Running", value: overview.activeSessionCount, caption: "sessions" },
          { label: "Runtimes", value: overview.runtimeHealth.online ?? 0, caption: "online" }
        ]}
      />
      <DataRows title="Priority lane" count={workItems.items.length}>
        {workItems.items.length === 0 ? (
          <EmptyState title="No work items" body="Create source-neutral work for this codebase." action="New item" />
        ) : null}
        {workItems.items.map((item, index) => (
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
