export interface DaemonCliConfig {
  apiUrl: string;
  runtimeId?: string;
  daemonId?: string;
  secret?: string;
  workspaceRoot?: string;
  command?: string[];
}

export type DaemonCommand = "start" | "status" | "doctor";

export function parseDaemonArgs(argv: string[]) {
  const args = argv[0] === "daemon" ? argv.slice(1) : argv;
  const command = (args[0] ?? "start") as DaemonCommand;
  const apiUrl = valueAfter(args, "--api-url") ?? process.env.AUTOMOMO_API_URL ?? "http://localhost:8000";
  const configPath = valueAfter(args, "--config") ?? ".automomo/daemon.json";
  return { command, apiUrl, configPath };
}

function valueAfter(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
