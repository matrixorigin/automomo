import { DaemonApiClient } from "./client";
import { parseDaemonArgs } from "./config";
import { runDoctor } from "./doctor";
import { DaemonWorker } from "./worker";

const args = parseDaemonArgs(process.argv.slice(2));
const apiUrl = args.apiUrl;
const runtimeName = process.env.AUTOMOMO_RUNTIME_NAME ?? "Local Pi runtime";

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
  registration: {
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

const result = await worker.pollOnce();
console.log(JSON.stringify(result, null, 2));
