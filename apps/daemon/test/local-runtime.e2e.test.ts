import { createApp } from "@automomo/api";
import { createPiRuntimeAdapter } from "@automomo/pi-runtime";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DaemonApiClient } from "../src/client";
import { DaemonWorker } from "../src/worker";

const now = "2026-04-20T08:00:00.000Z";
const later = "2026-04-20T08:01:00.000Z";
const repoRoot = resolve("../..");

function json(body: unknown) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

describe("local machine runtime end-to-end", () => {
  it("uses this repo as a local runtime, claims a session, and persists the outcome in SQLite", async () => {
    const dir = mkdtempSync(join(tmpdir(), "automomo-local-runtime-"));
    const dbPath = join(dir, "control-plane.sqlite");

    try {
      let clock = now;
      const previousDbPath = process.env.AUTOMOMO_DB_PATH;
      process.env.AUTOMOMO_DB_PATH = dbPath;
      const app = createApp({ now: () => new Date(clock) });
      const apiFetch: typeof fetch = async (input, init) => {
        const url = new URL(String(input));
        return app.request(`${url.pathname}${url.search}`, init);
      };
      const api = new DaemonApiClient({ baseUrl: "http://automomo.test", fetchImpl: apiFetch, now: () => new Date(clock) });

      try {
        await app.request(
          "/api/codebases",
          json({
            id: "codebase_local",
            name: "automomo",
            provider: "local",
            workspaceRoot: repoRoot
          })
        );
        await app.request(
          "/api/work-items",
          json({
            id: "work_local",
            codebaseId: "codebase_local",
            title: "Run automomo against the local repo",
            body: "Use this repository as the codebase mounted into the local machine runtime.",
            labels: ["local-runtime", "e2e"]
          })
        );
        await app.request(
          "/api/agents",
          json({
            id: "agent_local",
            name: "Local Agent",
            model: "metadata-only",
            instructions: "Exercise the local runtime flow without uploading source files."
          })
        );
        await app.request(
          "/api/sessions",
          json({
            id: "session_local",
            codebaseId: "codebase_local",
            workItemId: "work_local",
            agentId: "agent_local",
            runtimeId: "runtime_local"
          })
        );

        const worker = new DaemonWorker({
          client: api,
          registration: {
            runtimeId: "runtime_local",
            name: "Local automomo repo runtime",
            provider: "pi",
            environment: {
              workspaceRoot: repoRoot,
              networkPolicy: "restricted",
              env: {},
              secretRefs: []
            }
          },
          runtimeAdapter: createPiRuntimeAdapter({ now: () => new Date(later) })
        });

        clock = later;
        const result = await worker.pollOnce();

        expect(result).toMatchObject({
          status: "completed",
          sessionId: "session_local",
          outcomeId: "outcome_session_local"
        });

        const verificationApp = createApp({ now: () => new Date(later) });
        const sessionsRes = await verificationApp.request("/api/sessions");
        const sessionsPayload = (await sessionsRes.json()) as {
          sessions: Array<{ id: string; status: string; outcomeId?: string; runtimeId?: string }>;
        };
        expect(sessionsPayload.sessions).toEqual([
          expect.objectContaining({
            id: "session_local",
            status: "completed",
            runtimeId: "runtime_local",
            outcomeId: "outcome_session_local"
          })
        ]);

        const eventsRes = await verificationApp.request("/api/sessions/session_local/events");
        const eventsPayload = (await eventsRes.json()) as { events: Array<{ kind: string; summary: string; metadata: any }> };
        expect(eventsPayload.events).toEqual([
          expect.objectContaining({
            kind: "runtime",
            summary: "Pi runtime adapter accepted session",
            metadata: expect.objectContaining({ adapter: "pi", runtimeProvider: "pi" })
          })
        ]);

        const runtimesRes = await verificationApp.request("/api/runtimes");
        const runtimesPayload = (await runtimesRes.json()) as {
          runtimes: Array<{ id: string; mode: string; environment: { workspaceRoot?: string } }>;
        };
        expect(runtimesPayload.runtimes).toEqual([
          expect.objectContaining({
            id: "runtime_local",
            mode: "remote_daemon",
            environment: expect.objectContaining({ workspaceRoot: repoRoot })
          })
        ]);
      } finally {
        if (previousDbPath === undefined) {
          delete process.env.AUTOMOMO_DB_PATH;
        } else {
          process.env.AUTOMOMO_DB_PATH = previousDbPath;
        }
      }
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
