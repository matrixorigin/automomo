"use client";

import React from "react";

export function RuleEditor({
  agents,
  runtimes
}: {
  agents: { id: string; name: string }[];
  runtimes: { id: string; name: string }[];
}) {
  return (
    <form className="editor-panel" action="/api/orchestration-rules" method="post">
      <label>
        <span>Rule name</span>
        <input name="name" required />
      </label>
      <label>
        <span>Trigger</span>
        <select name="trigger" defaultValue="manual">
          <option value="manual">Manual</option>
          <option value="api">API</option>
          <option value="webhook">Webhook</option>
          <option value="sync">Sync</option>
          <option value="schedule">Schedule</option>
        </select>
      </label>
      <label>
        <span>Labels</span>
        <input name="labels" placeholder="runtime,ui" />
      </label>
      <label>
        <span>Priority</span>
        <select name="priority" defaultValue="medium">
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>
      <label>
        <span>Agent</span>
        <select name="agentId" defaultValue="">
          <option value="">Unassigned</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Runtime</span>
        <select name="runtimeId" defaultValue="">
          <option value="">Agent default</option>
          {runtimes.map((runtime) => (
            <option key={runtime.id} value={runtime.id}>
              {runtime.name}
            </option>
          ))}
        </select>
      </label>
      <label className="toggle-row">
        <input name="enabled" type="checkbox" defaultChecked />
        <span>Enabled</span>
      </label>
      <label>
        <span>Human approval</span>
        <select name="humanApproval" defaultValue="on_risk">
          <option value="never">Never</option>
          <option value="before_start">Before start</option>
          <option value="before_result">Before result</option>
          <option value="on_risk">On risk</option>
        </select>
      </label>
      <button type="submit">Save rule</button>
    </form>
  );
}
