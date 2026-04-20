"use client";

import React from "react";

export function AgentEditor({ runtimes }: { runtimes: { id: string; name: string }[] }) {
  return (
    <form className="editor-panel" action="/api/agents" method="post">
      <label>
        <span>Agent name</span>
        <input name="name" required />
      </label>
      <label>
        <span>Model</span>
        <input name="model" placeholder="gpt-5.4" />
      </label>
      <label className="wide">
        <span>Instructions</span>
        <textarea name="instructions" rows={4} />
      </label>
      <label>
        <span>Skills</span>
        <input name="skills" placeholder="runtime,testing" />
      </label>
      <label>
        <span>Tools</span>
        <input name="tools" placeholder="shell,git" />
      </label>
      <label>
        <span>Default runtime</span>
        <select name="defaultRuntimeId" defaultValue="">
          <option value="">None</option>
          {runtimes.map((runtime) => (
            <option key={runtime.id} value={runtime.id}>
              {runtime.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Concurrency</span>
        <input name="maxConcurrency" type="number" min={1} defaultValue={1} />
      </label>
      <button type="submit">Save agent</button>
    </form>
  );
}
