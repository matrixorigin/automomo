"use client";

import React, { useEffect, useState } from "react";
import { WorkItem } from "@automomo/protocol";
import { Badge, Button } from "./ui";

const statusOptions: Array<{ value: WorkItem["status"]; label: string }> = [
  { value: "open", label: "Open" },
  { value: "ready", label: "Ready" },
  { value: "running", label: "Running" },
  { value: "needs_human", label: "Needs human" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" }
];

export function RoomWorkCard({
  item,
  onStatusChange,
  error
}: {
  item: WorkItem;
  onStatusChange: (nextStatus: WorkItem["status"]) => Promise<void>;
  error?: string;
}) {
  const [selectedStatus, setSelectedStatus] = useState<WorkItem["status"]>(item.status);

  useEffect(() => {
    setSelectedStatus(item.status);
  }, [item.status]);

  return (
    <article className="room-work-card" data-work-item-id={item.id} data-work-item-patch-endpoint={`/api/work-items/${item.id}`}>
      <header className="room-work-card-header">
        <strong>{item.title}</strong>
        <Badge tone={priorityTone(item.priority)}>{item.priority}</Badge>
      </header>
      <p>{item.body || "No description provided."}</p>
      <div className="room-work-card-meta">
        <span>source: {item.source}</span>
        <span>status: {item.status}</span>
      </div>
      <div className="room-work-card-labels" aria-label="Work labels">
        {item.labels.length === 0 ? <Badge tone="neutral">no labels</Badge> : null}
        {item.labels.map((label) => (
          <Badge key={`${item.id}-${label}`} tone="blue">
            {label}
          </Badge>
        ))}
      </div>
      <form
        className="room-work-card-actions"
        onSubmit={(event) => {
          event.preventDefault();
          void onStatusChange(selectedStatus);
        }}
      >
        <label>
          <span>Move to</span>
          <select name="status" value={selectedStatus} onChange={(event) => setSelectedStatus(event.currentTarget.value as WorkItem["status"])}>
            {statusOptions.map((option) => (
              <option key={`${item.id}-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Update
        </Button>
      </form>
      {error ? <p className="room-work-card-error">{error}</p> : null}
    </article>
  );
}

function priorityTone(priority: WorkItem["priority"]) {
  if (priority === "urgent") {
    return "red";
  }
  if (priority === "high") {
    return "yellow";
  }
  if (priority === "low") {
    return "neutral";
  }
  return "green";
}
