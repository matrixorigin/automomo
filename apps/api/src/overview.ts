import { OverviewSchema } from "@automomo/protocol";
import { ControlPlaneStore } from "./store";

export function buildOverview(store: ControlPlaneStore) {
  const runtimes = store.listRuntimes();
  const sessions = store.listSessions();
  const overview = {
    counts: {
      codebases: store.listCodebases().length,
      workItems: store.listWorkItems().length,
      sessions: sessions.length,
      agents: store.listAgents().length,
      runtimes: runtimes.length
    },
    runtimeHealth: {
      idle: runtimes.filter((runtime) => runtime.status === "idle").length,
      online: runtimes.filter((runtime) => runtime.status === "online").length,
      offline: runtimes.filter((runtime) => runtime.status === "offline").length,
      busy: runtimes.filter((runtime) => runtime.status === "busy").length,
      unhealthy: runtimes.filter((runtime) => runtime.status === "unhealthy").length
    },
    handoffCount: store.listHandoffs().filter((handoff) => !["completed", "rejected", "resumed"].includes(handoff.status)).length,
    daemonCount: store.listDaemons().length,
    activeSessionCount: sessions.filter((session) =>
      ["queued", "leased", "running", "needs_human", "claimed_by_human", "resumed_by_agent"].includes(session.status)
    ).length,
    recentEvents: store.listAllSessionEvents(16).filter((event) => event.kind !== "handoff").slice(0, 8)
  };

  return OverviewSchema.parse(overview);
}
