import { AppShell } from "@/components/AppShell";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";

export default function SettingsPage() {
  return (
    <AppShell active="Settings">
      <WorkspaceHeader section="Settings" title="Workspace settings" action="Save" />
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
