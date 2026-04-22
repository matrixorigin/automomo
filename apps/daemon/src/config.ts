export interface DaemonCliConfig {
  apiUrl: string;
  runtimeId?: string;
  daemonId?: string;
  secret?: string;
  workspaceRoot?: string;
  command?: string[];
}

export type DaemonCommand = "start" | "once" | "status" | "doctor";

export function parseDaemonArgs(argv: string[]) {
  const commandArgs = argv[0] === "daemon" ? argv.slice(1) : argv;
  const args = commandArgs[0] === "--" ? commandArgs.slice(1) : commandArgs;
  const command = daemonCommand(args[0]);
  const apiUrl = valueAfter(args, "--api-url") ?? process.env.AUTOMOMO_API_URL ?? "http://localhost:8000";
  const configPath = valueAfter(args, "--config") ?? ".automomo/daemon.json";
  const idleIntervalMs = positiveInteger(
    valueAfter(args, "--idle-interval-ms") ?? process.env.AUTOMOMO_DAEMON_IDLE_INTERVAL_MS,
    2_000
  );
  const errorIntervalMs = positiveInteger(
    valueAfter(args, "--error-interval-ms") ?? process.env.AUTOMOMO_DAEMON_ERROR_INTERVAL_MS,
    5_000
  );
  const leaseRenewalIntervalMs = positiveInteger(
    valueAfter(args, "--lease-renewal-interval-ms") ?? process.env.AUTOMOMO_DAEMON_LEASE_RENEWAL_INTERVAL_MS,
    30_000
  );
  const maxIterations = optionalPositiveInteger(valueAfter(args, "--max-iterations"));
  return { command, apiUrl, configPath, idleIntervalMs, errorIntervalMs, leaseRenewalIntervalMs, maxIterations };
}

function valueAfter(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function daemonCommand(value: string | undefined): DaemonCommand {
  if (value === "once" || value === "status" || value === "doctor") {
    return value;
  }
  return "start";
}

function positiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalPositiveInteger(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
