import { describe, expect, it } from "vitest";
import { parseDaemonArgs } from "../src/config";
import { runDoctor } from "../src/doctor";

describe("daemon CLI operations", () => {
  it("parses start, once, status, and doctor commands", () => {
    const start = parseDaemonArgs([
      "daemon",
      "start",
      "--api-url",
      "http://localhost:8000",
      "--idle-interval-ms",
      "100",
      "--error-interval-ms",
      "200",
      "--lease-renewal-interval-ms",
      "300",
      "--max-iterations",
      "4"
    ]);

    expect(start).toMatchObject({
      command: "start",
      apiUrl: "http://localhost:8000",
      idleIntervalMs: 100,
      errorIntervalMs: 200,
      leaseRenewalIntervalMs: 300,
      maxIterations: 4
    });
    expect(parseDaemonArgs(["--", "start", "--max-iterations", "1"])).toMatchObject({
      command: "start",
      maxIterations: 1
    });
    expect(parseDaemonArgs(["daemon", "once"]).command).toBe("once");
    expect(parseDaemonArgs(["daemon", "status"]).command).toBe("status");
    expect(parseDaemonArgs(["daemon", "doctor"]).command).toBe("doctor");
  });

  it("reports doctor checks for API, config, workspace, runtime command, and clock", async () => {
    const result = await runDoctor({
      configPath: ".automomo/daemon.json",
      readConfig: async () => ({
        apiUrl: "http://automomo.test",
        runtimeId: "runtime_1",
        daemonId: "daemon_1",
        secret: "secret",
        workspaceRoot: "/tmp/work",
        command: ["node", "--version"]
      }),
      fetchImpl: async () => Response.json({ ok: true }),
      exists: async () => true,
      commandExists: async () => true,
      now: () => new Date("2026-04-20T08:00:00.000Z")
    });

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual([
      "API reachability",
      "Config file",
      "Workspace root",
      "Runtime command",
      "Clock skew"
    ]);
  });
});
