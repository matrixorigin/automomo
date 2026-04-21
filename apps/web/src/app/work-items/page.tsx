import React from "react";
import { AppShell } from "../../components/AppShell";
import { DataRow, DataRows } from "../../components/DataRows";
import { EmptyState } from "../../components/EmptyState";
import { Totals } from "../../components/Totals";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { getApiClient } from "../../lib/api";

export const dynamic = "force-dynamic";

export default async function WorkItemsPage() {
  const api = getApiClient();
  const [overview, workItems, rooms] = await Promise.all([api.getOverview(), api.listWorkItems(), api.listRooms()]);
  const workGroups = groupWorkByRoom(workItems.items, rooms.items);
  return (
    <AppShell active="Work Items" overview={overview}>
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
          { label: "Urgent", value: workItems.items.filter((item) => item.priority === "urgent").length, caption: "needs routing" },
          { label: "Ready", value: workItems.items.filter((item) => item.status === "ready").length, caption: "agent-ready" },
          { label: "Human", value: workItems.items.filter((item) => item.status === "needs_human").length, caption: "handoffs" }
        ]}
      />
      {workGroups.length === 0 ? (
        <DataRows title="Current items" count={workItems.page.total}>
          <EmptyState title="No work items" body="Work from manual, API, sync, or webhook sources will appear here." />
        </DataRows>
      ) : null}
      {workGroups.map((group) => (
        <DataRows key={group.key} title={group.title} count={group.items.length}>
          {group.items.map((item) => (
            <DataRow
              key={item.id}
              title={item.title}
              subtitle={item.body}
              code={item.id.toUpperCase()}
              status={item.status}
              meta={[
                { label: "Priority", value: item.priority, caption: item.source },
                { label: "Room", value: group.title, caption: item.labels[0] ?? item.codebaseId }
              ]}
              action="Start"
            />
          ))}
        </DataRows>
      ))}
    </AppShell>
  );
}

function groupWorkByRoom<T extends { roomId?: string }>(items: T[], rooms: { id: string; name: string }[]) {
  const roomNames = new Map(rooms.map((room) => [room.id, room.name]));
  const groups = new Map<string, { key: string; title: string; items: T[] }>();
  for (const item of items) {
    const key = item.roomId ?? "unassigned";
    const title = item.roomId ? (roomNames.get(item.roomId) ?? item.roomId) : "Unassigned";
    const existing = groups.get(key) ?? { key, title, items: [] };
    existing.items.push(item);
    groups.set(key, existing);
  }
  return [...groups.values()];
}
