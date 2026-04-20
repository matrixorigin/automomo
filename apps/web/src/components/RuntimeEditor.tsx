"use client";

import React from "react";
import { commaList, commandList, numberValue, optionalString, submitJsonForm } from "./jsonSubmit";

export function buildRuntimePayload(formData: FormData) {
  return compact({
    name: optionalString(formData.get("name")),
    mode: optionalString(formData.get("mode")) ?? "local",
    provider: optionalString(formData.get("provider")) ?? "pi",
    capacity: numberValue(formData.get("capacity"), 1),
    environment: compact({
      workspaceRoot: optionalString(formData.get("workspaceRoot")),
      image: optionalString(formData.get("image")),
      command: commandList(formData.get("command")),
      networkPolicy: optionalString(formData.get("networkPolicy")) ?? "restricted",
      env: {},
      secretRefs: commaList(formData.get("secretRefs"))
    })
  });
}

export function RuntimeEditor() {
  return (
    <form className="editor-panel" data-json-endpoint="/api/runtimes" onSubmit={submitJsonForm("/api/runtimes", buildRuntimePayload)}>
      <label>
        <span>Runtime name</span>
        <input name="name" required />
      </label>
      <label>
        <span>Mode</span>
        <select name="mode" defaultValue="local">
          <option value="local">Local</option>
          <option value="remote_daemon">Remote daemon</option>
          <option value="hosted">Hosted</option>
        </select>
      </label>
      <label>
        <span>Provider</span>
        <select name="provider" defaultValue="pi">
          <option value="pi">Pi</option>
          <option value="shell">Shell</option>
          <option value="docker">Docker</option>
          <option value="codex">Codex</option>
        </select>
      </label>
      <label>
        <span>Workspace root</span>
        <input name="workspaceRoot" placeholder="/src/codebase" />
      </label>
      <label>
        <span>Image</span>
        <input name="image" placeholder="node:22" />
      </label>
      <label>
        <span>Command</span>
        <input name="command" placeholder="pnpm test" />
      </label>
      <label>
        <span>Capacity</span>
        <input name="capacity" type="number" min={1} defaultValue={1} />
      </label>
      <label>
        <span>Network</span>
        <select name="networkPolicy" defaultValue="restricted">
          <option value="restricted">Restricted</option>
          <option value="disabled">Disabled</option>
          <option value="default">Default</option>
        </select>
      </label>
      <label>
        <span>Secret refs</span>
        <input name="secretRefs" placeholder="GITHUB_TOKEN" />
      </label>
      <button type="submit">Save runtime</button>
    </form>
  );
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && (!Array.isArray(item) || item.length > 0))
  ) as Partial<T>;
}
