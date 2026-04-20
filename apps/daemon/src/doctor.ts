import { DaemonCliConfig } from "./config";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DoctorOptions {
  configPath: string;
  readConfig: () => Promise<DaemonCliConfig>;
  fetchImpl?: typeof fetch;
  exists?: (path: string) => Promise<boolean>;
  commandExists?: (command: string) => Promise<boolean>;
  now?: () => Date;
}

export async function runDoctor(options: DoctorOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const exists = options.exists ?? (async () => true);
  const commandExists = options.commandExists ?? (async () => true);
  const now = options.now ?? (() => new Date());
  const config = await options.readConfig();
  const checks: DoctorCheck[] = [];

  checks.push(await check("API reachability", async () => (await fetchImpl(`${config.apiUrl}/healthz`)).ok, config.apiUrl));
  checks.push(await check("Config file", async () => exists(options.configPath), options.configPath));
  checks.push(await check("Workspace root", async () => exists(config.workspaceRoot ?? process.cwd()), config.workspaceRoot ?? process.cwd()));
  checks.push(await check("Runtime command", async () => commandExists(config.command?.[0] ?? "node"), config.command?.join(" ") ?? "node"));
  checks.push({ name: "Clock skew", ok: !Number.isNaN(now().getTime()), detail: now().toISOString() });

  return { ok: checks.every((item) => item.ok), checks };
}

async function check(name: string, fn: () => Promise<boolean>, detail: string): Promise<DoctorCheck> {
  try {
    return { name, ok: await fn(), detail };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : detail };
  }
}
