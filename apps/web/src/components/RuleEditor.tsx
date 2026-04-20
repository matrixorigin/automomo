"use client";

import React from "react";
import { commaList, optionalString, submitJsonForm } from "./jsonSubmit";

export function buildRulePayload(formData: FormData) {
  const labels = commaList(formData.get("labels"));
  const priority = optionalString(formData.get("priority"));
  return compact({
    codebaseId: optionalString(formData.get("codebaseId")),
    name: optionalString(formData.get("name")),
    trigger: optionalString(formData.get("trigger")) ?? "manual",
    match: {
      ...(labels.length ? { labels } : {}),
      ...(priority ? { priority: [priority] } : {})
    },
    agentId: optionalString(formData.get("agentId")),
    runtimeId: optionalString(formData.get("runtimeId")),
    enabled: formData.get("enabled") === "on",
    humanApproval: optionalString(formData.get("humanApproval")) ?? "on_risk"
  });
}

export function RuleEditor({
  codebases,
  agents,
  runtimes
}: {
  codebases: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  runtimes: { id: string; name: string }[];
}) {
  return (
    <form
      className="editor-panel"
      data-json-endpoint="/api/orchestration-rules"
      onSubmit={submitJsonForm("/api/orchestration-rules", buildRulePayload)}
    >
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

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
