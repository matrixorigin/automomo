import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders grouped room-first navigation with dynamic rooms and agents", () => {
    const html = renderToStaticMarkup(
      <AppShell
        active="Work Items"
        activeRoomId="room_ops"
        rooms={[
          { id: "room_ops", name: "Ops", status: "active" },
          { id: "room_api", name: "API", status: "active" }
        ]}
        agents={[
          { id: "agent_ralph", name: "Ralph", metadata: {} },
          { id: "agent_backend", name: "Backend Lead", metadata: { color: "#22c55e" } }
        ]}
      >
        <main>Workspace</main>
      </AppShell>
    );

    expect(html).toContain("automomo");
    expect(html).toContain("Workspace");
    expect(html).toContain("Rooms");
    expect(html).toContain("Agents");
    expect(html).toContain("Operations");
    expect(html).toContain("Settings");
    expect(html).toContain("Home");

    expect(html).toContain("href=\"/rooms/room_ops\"");
    expect(html).toContain("href=\"/rooms/room_api\"");
    expect(html).toContain("Ops");
    expect(html).toContain("API");

    expect(html).toContain("Ralph");
    expect(html).toContain("Backend Lead");
    expect(html).toContain("agent-avatar");

    const operationsStart = html.indexOf("Operations");
    const workItemsIndex = html.indexOf("Work Items");
    const sessionsIndex = html.indexOf("Sessions");
    const runtimesIndex = html.indexOf("Runtimes");
    const orchestrationIndex = html.indexOf("Orchestration");

    expect(operationsStart).toBeGreaterThan(-1);
    expect(workItemsIndex).toBeGreaterThan(operationsStart);
    expect(sessionsIndex).toBeGreaterThan(operationsStart);
    expect(runtimesIndex).toBeGreaterThan(operationsStart);
    expect(orchestrationIndex).toBeGreaterThan(operationsStart);

    expect(html).toContain("class=\"nav-item active\" href=\"/rooms/room_ops\"");
    expect(html).toContain("Work Items");
    expect(html).not.toContain("Control Plane");
    expect(html).not.toContain("Auto-Mobile");
    expect(html).not.toContain("Pull Requests");
  });
});
