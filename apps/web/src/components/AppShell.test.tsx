import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders room-first workspace navigation vocabulary", () => {
    const html = renderToStaticMarkup(
      <AppShell active="Work Items">
        <main>Workspace</main>
      </AppShell>
    );

    expect(html).toContain("automomo");
    expect(html).toContain("Work Items");
    expect(html).toContain("Rooms");
    expect(html).toContain("Agents");
    expect(html).toContain("Runtimes");
    expect(html).not.toContain("Control Plane");
    expect(html).not.toContain("Auto-Mobile");
    expect(html).not.toContain("Pull Requests");
  });
});
