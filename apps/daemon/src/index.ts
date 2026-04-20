import { DaemonApiClient } from "./client";
import { DaemonWorker } from "./worker";

const apiUrl = process.env.AUTOMOMO_API_URL ?? "http://localhost:8000";
const runtimeName = process.env.AUTOMOMO_RUNTIME_NAME ?? "Local Pi runtime";

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
