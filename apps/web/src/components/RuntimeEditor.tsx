"use client";

import React from "react";

export function RuntimeEditor() {
  return (
    <form className="editor-panel" action="/api/runtimes" method="post">
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
