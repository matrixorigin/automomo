import { AppShell } from "@/components/AppShell";
import { DataRow, DataRows } from "@/components/DataRows";
import { Totals } from "@/components/Totals";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { workItems } from "@/lib/mock-data";

export default function WorkItemsPage() {
  return (
    <AppShell active="Work Items">
      <WorkspaceHeader section="Work Items" title="Work queue" action="New item" />
      <div className="mode-row" aria-label="Work item controls">
        <div className="tabs" role="tablist" aria-label="Status filter">
          <button className="tab active" type="button">All</button>
          <button className="tab" type="button">Ready</button>
          <button className="tab" type="button">Needs Human</button>
        </div>
        <label className="search">
          <span aria-hidden="true" />
          <input type="search" placeholder="Search work" />
        </label>
      </div>
      <Totals
        items={[
          { label: "Urgent", value: workItems.filter((item) => item.priority === "urgent").length, caption: "needs routing" },
          { label: "Ready", value: workItems.filter((item) => item.status === "ready").length, caption: "agent-ready" },
          { label: "Human", value: workItems.filter((item) => item.status === "needs_human").length, caption: "handoffs" }
        ]}
      />
      <DataRows title="Current items" count={workItems.length}>
        {workItems.map((item) => (
          <DataRow
            key={item.id}
            title={item.title}
            subtitle={item.body}
            code={item.id.toUpperCase()}
            status={item.status}
            meta={[
              { label: "Priority", value: item.priority, caption: item.source },
              { label: "Codebase", value: "automomo", caption: item.labels[0] ?? "general" }
            ]}
            action="Start"
          />
        ))}
      </DataRows>
    </AppShell>
  );
}
