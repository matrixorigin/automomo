import { RuntimeExecutionRequest } from "@automomo/protocol";
import { redactSecrets } from "../security/redact";
import { ControlPlaneStore } from "../store";
import { runShellRuntime } from "./shell";

export async function executeLocalRuntime(input: {
  store: ControlPlaneStore;
  sessionId: string;
  request: RuntimeExecutionRequest;
  now: string;
}) {
  const session = input.store.getSession(input.sessionId);
  if (!session) {
    throw new Error("session not found");
  }
  if (!["queued", "resumed_by_agent", "needs_human"].includes(session.status)) {
    throw new Error(`session ${session.status} cannot run locally`);
  }
  const runtime = session.runtimeId ? input.store.getRuntime(session.runtimeId) : undefined;
  if (!runtime) {
    throw new Error("runtime not found");
  }
  const result =
    input.request.provider === "shell"
      ? await runShellRuntime({ session, runtime, now: input.now, timeoutMs: input.request.timeoutMs })
      : await runShellRuntime({ session, runtime, now: input.now, timeoutMs: input.request.timeoutMs });
  const secretRefs = runtime.environment.secretRefs;
  const events = input.store.appendSessionEvents(
    session.id,
    result.events.map((event) => redactSecrets(event, secretRefs))
  );
  const outcome = input.store.saveOutcome(redactSecrets({ ...result.outcome, eventsUploaded: events.length }, secretRefs));
  return { events, outcome, session: input.store.getSession(session.id) };
}
