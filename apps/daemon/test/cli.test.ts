import { describe, expect, it } from "vitest";
import { parseDaemonArgs } from "../src/config";
import { runDoctor } from "../src/doctor";

describe("daemon CLI operations", () => {
  it("parses start, status, and doctor commands", () => {
    expect(parseDaemonArgs(["daemon", "start", "--api-url", "http://localhost:8000"]).command).toBe("start");
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
