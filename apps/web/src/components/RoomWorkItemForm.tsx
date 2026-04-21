"use client";

import React from "react";
import { commaList, optionalString, submitJsonForm } from "./jsonSubmit";

export function RoomWorkItemForm({ roomId }: { roomId: string }) {
  return (
    <form
      className="editor-panel"
      data-json-endpoint={`/api/rooms/${roomId}/work-items`}
      onSubmit={submitJsonForm(`/api/rooms/${roomId}/work-items`, (formData) => ({
        title: optionalString(formData.get("title")),
        body: optionalString(formData.get("body")) ?? "",
        status: optionalString(formData.get("status")) ?? "open",
        priority: optionalString(formData.get("priority")) ?? "medium",
        labels: commaList(formData.get("labels"))
      }))}
    >
      <label>
        <span>Work title</span>
        <input name="title" required />
      </label>
      <label>
        <span>Status</span>
        <select name="status" defaultValue="open">
          <option value="open">Open</option>
          <option value="ready">Ready</option>
          <option value="running">Running</option>
          <option value="needs_human">Needs human</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <label>
        <span>Priority</span>
        <select name="priority" defaultValue="medium">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </label>
      <label>
        <span>Labels</span>
        <input name="labels" placeholder="runtime, ui" />
      </label>
      <label className="wide">
        <span>Body</span>
        <textarea name="body" rows={3} />
      </label>
      <button type="submit">Add work</button>
    </form>
  );
}
