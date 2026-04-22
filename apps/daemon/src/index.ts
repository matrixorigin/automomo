import { DaemonApiClient } from "./client";
import { parseDaemonArgs } from "./config";
import { runDoctor } from "./doctor";
import { runDaemonLoop } from "./loop";
import { DaemonWorker } from "./worker";

const args = parseDaemonArgs(process.argv.slice(2));
const apiUrl = args.apiUrl;
const runtimeName = process.env.AUTOMOMO_RUNTIME_NAME ?? "Local Pi runtime";
const environmentId = process.env.AUTOMOMO_ENVIRONMENT_ID ?? process.env.AUTOMOMO_RUNTIME_ID ?? "environment_local";

if (args.command === "doctor") {
  const result = await runDoctor({
    configPath: args.configPath,
    readConfig: async () => ({ apiUrl, workspaceRoot: process.cwd(), command: [process.execPath] })
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (args.command === "status") {
  console.log(JSON.stringify({ status: "configured", apiUrl }, null, 2));
  process.exit(0);
}

const worker = new DaemonWorker({
  client: new DaemonApiClient({ baseUrl: apiUrl }),
  leaseRenewalIntervalMs: args.leaseRenewalIntervalMs,
  onKeepaliveError: (error) => {
    console.error(
      JSON.stringify(
        {
          status: "keepalive_error",
          reason: error instanceof Error ? error.message : "lease keepalive failed"
        },
        null,
        2
      )
    );
  },
  registration: {
    runtimeId: environmentId,
    name: runtimeName,
    provider: "pi",
    environment: {
      workspaceRoot: process.cwd(),
      networkPolicy: "restricted",
      env: {},
      secretRefs: []
    }
  }
});

if (args.command === "once") {
  const result = await worker.pollOnce();
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const abortController = new AbortController();
process.once("SIGINT", () => abortController.abort());
process.once("SIGTERM", () => abortController.abort());

const result = await runDaemonLoop({
  worker,
  idleIntervalMs: args.idleIntervalMs,
  errorIntervalMs: args.errorIntervalMs,
  maxIterations: args.maxIterations,
  signal: abortController.signal
});
console.log(JSON.stringify(result, null, 2));
