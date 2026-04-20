import { describe, expect, it } from "vitest";
import { buildDockerRunCommand } from "../src/runtime/docker";

const now = "2026-04-20T08:00:00.000Z";

describe("local runtime provider helpers", () => {
  it("assembles a constrained Docker command without making Docker required for tests", () => {
    const command = buildDockerRunCommand({
      workspaceRoot: "/tmp/work",
      runtime: {
        id: "runtime_1",
        name: "Docker runtime",
        mode: "local",
        provider: "docker",
        environment: {
          image: "node:22",
          command: ["pnpm", "test"],
          memoryMB: 1024,
          cpus: 2,
          networkPolicy: "disabled",
          env: { SAFE_FLAG: "1" },
          secretRefs: []
        },
        status: "online",
        capacity: 1,
        activeSessions: 0,
        metadata: {},
        createdAt: now,
        updatedAt: now
      }
    });

    expect(command).toEqual([
      "docker",
      "run",
      "--rm",
      "--memory=1024m",
      "--cpus=2",
      "--network=none",
      "--env",
      "SAFE_FLAG",
      "-v",
      "/tmp/work:/workspace",
      "-w",
      "/workspace",
      "node:22",
      "pnpm",
      "test"
    ]);
  });
});
