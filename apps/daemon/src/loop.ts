import { DaemonWorker } from "./worker";

export interface DaemonLoopOptions {
  worker: Pick<DaemonWorker, "pollOnce">;
  idleIntervalMs: number;
  errorIntervalMs: number;
  maxIterations?: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  logger?: Pick<Console, "log" | "error">;
}

export interface DaemonLoopResult {
  status: "stopped";
  reason: "aborted" | "max_iterations";
  iterations: number;
}

export async function runDaemonLoop(options: DaemonLoopOptions): Promise<DaemonLoopResult> {
  const sleep = options.sleep ?? delay;
  const logger = options.logger ?? console;
  let iterations = 0;

  logger.log(
    JSON.stringify(
      {
        status: "started",
        mode: "long_running",
        idleIntervalMs: options.idleIntervalMs,
        errorIntervalMs: options.errorIntervalMs
      },
      null,
      2
    )
  );

  while (!options.signal?.aborted) {
    if (options.maxIterations !== undefined && iterations >= options.maxIterations) {
      return { status: "stopped", reason: "max_iterations", iterations };
    }

    iterations += 1;
    try {
      const result = await options.worker.pollOnce();
      logger.log(JSON.stringify({ iteration: iterations, ...result }, null, 2));

      if (options.maxIterations !== undefined && iterations >= options.maxIterations) {
        return { status: "stopped", reason: "max_iterations", iterations };
      }

      if (result.status === "idle") {
        await sleep(options.idleIntervalMs, options.signal);
      }
    } catch (error) {
      logger.error(
        JSON.stringify(
          {
            iteration: iterations,
            status: "error",
            reason: error instanceof Error ? error.message : "daemon poll failed"
          },
          null,
          2
        )
      );

      if (options.maxIterations !== undefined && iterations >= options.maxIterations) {
        return { status: "stopped", reason: "max_iterations", iterations };
      }

      await sleep(options.errorIntervalMs, options.signal);
    }
  }

  return { status: "stopped", reason: "aborted", iterations };
}

export function delay(ms: number, signal?: AbortSignal) {
  if (ms <= 0 || signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(cleanup, ms);
    const abort = () => cleanup();

    function cleanup() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      resolve();
    }

    signal?.addEventListener("abort", abort, { once: true });
  });
}
