import { RuntimeExecutionRequest } from "@automomo/protocol";
import { createPiRuntimeAdapter } from "@automomo/pi-runtime";
import { redactSecrets } from "../security/redact";
import { ControlPlaneStore } from "../store";
import { buildDockerRunCommand } from "./docker";
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
  if (runtime.mode !== "local") {
    throw new Error(`runtime mode ${runtime.mode} cannot run through local execution`);
  }
  if (input.request.provider !== runtime.provider) {
    throw new Error(`runtime provider ${runtime.provider} cannot execute ${input.request.provider} requests`);
  }
  const result =
    runtime.provider === "shell"
      ? await runShellRuntime({ session, runtime, now: input.now, timeoutMs: input.request.timeoutMs })
      : runtime.provider === "docker"
        ? await runShellRuntime({
            session,
            runtime: {
              ...runtime,
              provider: "shell",
              environment: {
                ...runtime.environment,
                command: buildDockerRunCommand({
                  runtime,
                  workspaceRoot: runtime.environment.workspaceRoot ?? process.cwd()
                })
              }
            },
            now: input.now,
            timeoutMs: input.request.timeoutMs
          })
        : runtime.provider === "pi"
          ? await createPiRuntimeAdapter({
              now: () => new Date(input.now),
              config: isRecord(runtime.metadata.piRuntime) ? runtime.metadata.piRuntime : undefined
            }).runSession({
              session,
              runtime,
              workItem: session.workItemId ? input.store.getWorkItem(session.workItemId) : undefined,
              agent: session.agentId ? input.store.getAgent(session.agentId) : undefined
            })
          : unsupportedProvider(runtime.provider);
  const secretRefs = runtime.environment.secretRefs;
  const secretValues = runtimeSecretValues(runtime.environment.env, secretRefs);
  const events = input.store.appendSessionEvents(
    session.id,
    result.events.map((event) => redactRuntimeEvent(event, secretRefs, secretValues))
  );
  const outcome = input.store.saveOutcome(redactSecrets({ ...result.outcome, eventsUploaded: events.length }, secretRefs, secretValues));
  return { events, outcome, session: input.store.getSession(session.id) };
}

function redactRuntimeEvent<T extends { summary: string; detail?: string }>(event: T, secretRefs: string[], secretValues: string[]): T {
  const redacted = redactSecrets(event, secretRefs, secretValues);
  if (typeof redacted.detail !== "string" || redacted.detail === event.detail) {
    return redacted;
  }
  const summary = redacted.detail.trim().slice(0, 180);
  return { ...redacted, summary: summary || redacted.summary };
}

function runtimeSecretValues(env: Record<string, string>, secretRefs: string[]) {
  const refs = new Set(secretRefs.map((item) => item.toLowerCase()));
  return Object.entries(env)
    .filter(([key]) => refs.has(key.toLowerCase()))
    .map(([, value]) => value);
}

function unsupportedProvider(provider: string): never {
  throw new Error(`unsupported local runtime provider ${provider}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
