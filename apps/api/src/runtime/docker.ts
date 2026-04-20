import { Runtime } from "@automomo/protocol";

export function buildDockerRunCommand(input: { runtime: Runtime; workspaceRoot: string }) {
  const env = Object.keys(input.runtime.environment.env).flatMap((key) => ["--env", key]);
  const limits = [
    input.runtime.environment.memoryMB ? `--memory=${input.runtime.environment.memoryMB}m` : undefined,
    input.runtime.environment.cpus ? `--cpus=${input.runtime.environment.cpus}` : undefined,
    input.runtime.environment.networkPolicy === "disabled" ? "--network=none" : undefined
  ].filter((value): value is string => value !== undefined);

  return [
    "docker",
    "run",
    "--rm",
    ...limits,
    ...env,
    "-v",
    `${input.workspaceRoot}:/workspace`,
    "-w",
    "/workspace",
    input.runtime.environment.image ?? "node:22",
    ...(input.runtime.environment.command ?? [])
  ];
}
