import { AppShell } from "../../components/AppShell";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { getApiClient } from "../../lib/api";
import React from "react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const api = getApiClient();
  const [overview, rooms, agents] = await Promise.all([api.getOverview(), api.listRooms(), api.listAgents()]);

  return (
    <AppShell active="Settings" overview={overview} rooms={rooms.items} agents={agents}>
      <WorkspaceHeader section="Settings" title="Setup and configuration" />
      <section className="settings-grid">
        <label>
          <span>API base URL</span>
          <input defaultValue="http://localhost:8000" />
        </label>
        <label>
          <span>Default runtime mode</span>
          <select defaultValue="local">
            <option value="local">Local</option>
            <option value="remote_daemon">Remote daemon</option>
            <option value="hosted">Hosted</option>
          </select>
        </label>
      </section>
    </AppShell>
  );
}
