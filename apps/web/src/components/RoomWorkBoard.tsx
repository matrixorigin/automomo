"use client";

import React, { useMemo, useState } from "react";
import { WorkItem } from "@automomo/protocol";
import { createAutomomoApiClient } from "../lib/api";
import { RoomWorkCard } from "./RoomWorkCard";
import { RoomWorkItemForm } from "./RoomWorkItemForm";

type BoardColumn = "open" | "active" | "human" | "done";

const boardColumns: Array<{ id: BoardColumn; title: string }> = [
  { id: "open", title: "Open" },
  { id: "active", title: "Active" },
  { id: "human", title: "Human" },
  { id: "done", title: "Done" }
];

export function RoomWorkBoard({ roomId, initialItems }: { roomId: string; initialItems: WorkItem[] }) {
  const api = useMemo(() => createAutomomoApiClient({ baseUrl: "" }), []);
  const [items, setItems] = useState(initialItems);
  const [errorByItemId, setErrorByItemId] = useState<Record<string, string>>({});

  const columns = useMemo(() => groupItemsByBoardColumn(items), [items]);

  async function handleStatusChange(itemId: string, nextStatus: WorkItem["status"]) {
    const current = items.find((item) => item.id === itemId);
    if (!current || current.status === nextStatus) {
      return;
    }

    setErrorByItemId((errors) => ({ ...errors, [itemId]: "" }));
    setItems((existing) => existing.map((item) => (item.id === itemId ? { ...item, status: nextStatus } : item)));

    try {
      const updated = await api.updateWorkItem(itemId, { status: nextStatus });
      setItems((existing) => existing.map((item) => (item.id === itemId ? updated : item)));
    } catch (error) {
      setItems((existing) => existing.map((item) => (item.id === itemId ? { ...item, status: current.status } : item)));
      setErrorByItemId((errors) => ({
        ...errors,
        [itemId]: error instanceof Error ? error.message : "Unable to update status right now."
      }));
    }
  }

  return (
    <section className="room-work-board" aria-label="Room work board">
      <section className="room-work-board-create">
        <div className="floor-heading">
          <h2>
            Room board <span>{items.length}</span>
          </h2>
        </div>
        <RoomWorkItemForm roomId={roomId} className="room-work-create-form" />
      </section>

      <div className="room-work-board-columns">
        {boardColumns.map((column) => {
          const columnItems = columns[column.id];
          return (
            <section className="room-work-column" key={column.id} data-work-column={column.id}>
              <header>
                <h3>{column.title}</h3>
                <span>{columnItems.length}</span>
              </header>
              <div className="room-work-column-cards">
                {columnItems.length === 0 ? <p className="room-work-column-empty">No items</p> : null}
                {columnItems.map((item) => (
                  <RoomWorkCard
                    key={item.id}
                    item={item}
                    error={errorByItemId[item.id]}
                    onStatusChange={(nextStatus) => handleStatusChange(item.id, nextStatus)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function groupItemsByBoardColumn(items: WorkItem[]) {
  const grouped: Record<BoardColumn, WorkItem[]> = { open: [], active: [], human: [], done: [] };
  for (const item of items) {
    grouped[toBoardColumn(item.status)].push(item);
  }
  return grouped;
}

function toBoardColumn(status: WorkItem["status"]): BoardColumn {
  if (status === "open" || status === "ready") {
    return "open";
  }
  if (status === "running") {
    return "active";
  }
  if (status === "needs_human") {
    return "human";
  }
  return "done";
}
