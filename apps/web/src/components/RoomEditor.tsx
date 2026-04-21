"use client";

import React from "react";
import { optionalString, submitJsonForm } from "./jsonSubmit";

export function buildRoomPayload(formData: FormData) {
  return compact({
    codebaseId: optionalString(formData.get("codebaseId")),
    name: optionalString(formData.get("name")),
    description: optionalString(formData.get("description")) ?? "",
    status: optionalString(formData.get("status")) ?? "active"
  });
}

export function RoomEditor({ codebases }: { codebases: { id: string; name: string }[] }) {
  return (
    <form className="editor-panel" data-json-endpoint="/api/rooms" onSubmit={submitJsonForm("/api/rooms", buildRoomPayload)}>
      <label>
        <span>Codebase</span>
        <select name="codebaseId" defaultValue={codebases[0]?.id ?? ""} required>
          {codebases.map((codebase) => (
            <option key={codebase.id} value={codebase.id}>
              {codebase.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Room name</span>
        <input name="name" required />
      </label>
      <label className="wide">
        <span>Description</span>
        <textarea name="description" rows={3} />
      </label>
      <label>
        <span>Status</span>
        <select name="status" defaultValue="active">
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <button type="submit">Save room</button>
    </form>
  );
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
