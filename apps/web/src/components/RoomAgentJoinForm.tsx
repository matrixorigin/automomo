"use client";

import React from "react";
import { submitJsonForm } from "./jsonSubmit";

export function RoomAgentJoinForm({
  roomId,
  agents,
  joinedAgentIds
}: {
  roomId: string;
  agents: { id: string; name: string }[];
  joinedAgentIds: string[];
}) {
  const availableAgents = agents.filter((agent) => !joinedAgentIds.includes(agent.id));
  return (
    <form
      className="editor-panel compact-editor"
      data-json-endpoint={`/api/rooms/${roomId}/agents`}
      onSubmit={submitJsonForm(`/api/rooms/${roomId}/agents`, (formData) => ({
        agentId: String(formData.get("agentId") ?? "")
      }))}
    >
      <label>
        <span>Add agent</span>
        <select name="agentId" defaultValue={availableAgents[0]?.id ?? ""} required>
          {availableAgents.length === 0 ? <option value="">All agents joined</option> : null}
          {availableAgents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={availableAgents.length === 0}>
        Join room
      </button>
    </form>
  );
}
