import { describe, expect, it } from "vitest";
import { runDaemonLoop } from "../src/loop";

describe("runDaemonLoop", () => {
  it("keeps polling and waits only while idle", async () => {
    const sleeps: number[] = [];
    const results = [{ status: "idle" as const }, { status: "completed" as const, leaseId: "lease_1", runId: "run_1", outcomeId: "outcome_1" }];
    const worker = {
      pollOnce: async () => results.shift() ?? { status: "idle" as const }
    };

    const result = await runDaemonLoop({
      worker,
      idleIntervalMs: 123,
      errorIntervalMs: 999,
      maxIterations: 2,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      logger: { log: () => undefined, error: () => undefined }
    });

    expect(result).toEqual({ status: "stopped", reason: "max_iterations", iterations: 2 });
    expect(sleeps).toEqual([123]);
  });

  it("continues polling after a transient error", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const worker = {
      pollOnce: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("API unavailable");
        }
        return { status: "idle" as const };
      }
    };

    const result = await runDaemonLoop({
      worker,
      idleIntervalMs: 100,
      errorIntervalMs: 500,
      maxIterations: 2,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      logger: { log: () => undefined, error: () => undefined }
    });

    expect(result).toEqual({ status: "stopped", reason: "max_iterations", iterations: 2 });
    expect(sleeps).toEqual([500]);
  });
});
