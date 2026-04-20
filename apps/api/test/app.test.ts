import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { MemoryStore, SQLiteStore } from "../src/store";

const now = "2026-04-20T08:00:00.000Z";
const later = "2026-04-20T08:01:00.000Z";

function json(body: unknown, headers: Record<string, string> = {}) {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  };
}

describe("automomo API", () => {
  it("creates codebase, work item, session events, handoff, and outcome through generic product nouns", async () => {
    const store = new MemoryStore();
    let current = now;
    const app = createApp({ store, now: () => new Date(current) });

    const codebaseRes = await app.request(
      "/api/codebases",
      json({ id: "codebase_1", name: "automomo", provider: "git" })
    );
    expect(codebaseRes.status).toBe(201);

    const workRes = await app.request(
      "/api/work-items",
      json({ id: "work_1", codebaseId: "codebase_1", title: "Investigate lease handling", labels: ["runtime"] })
    );
    expect(workRes.status).toBe(201);

    const runtimeRes = await app.request(
      "/api/runtimes",
      json({ id: "runtime_1", name: "Local Pi runtime", mode: "local", provider: "pi", status: "online" })
    );
    expect(runtimeRes.status).toBe(201);
    const daemon = await registerDaemon(app, "runtime_1", now);

    const sessionRes = await app.request(
      "/api/sessions",
      json({ id: "session_1", codebaseId: "codebase_1", workItemId: "work_1", runtimeId: "runtime_1" })
    );
    expect(sessionRes.status).toBe(201);

    const leaseRes = await app.request("/api/daemon/lease", signedJson("/api/daemon/lease", { runtimeId: "runtime_1" }, daemon, now));
    expect(leaseRes.status).toBe(200);
    const leasePayload = (await leaseRes.json()) as { lease: { leaseId: string } };

    current = later;
    const eventRes = await app.request(
      "/api/daemon/events",
      signedJson("/api/daemon/events", {
        runtimeId: "runtime_1",
        leaseId: leasePayload.lease.leaseId,
        sessionId: "session_1",
        events: [
          {
            id: "event_1",
            sessionId: "session_1",
            sequence: 0,
            kind: "runtime",
            summary: "Pi runtime started",
            createdAt: later
          }
        ]
      }, daemon, later)
    );
    expect(eventRes.status).toBe(200);

    const handoffRes = await app.request(
      "/api/sessions/session_1/handoff",
      json({ reason: "Need human confirmation before applying patch", note: "Check API compatibility." })
    );
    const handoffPayload = (await handoffRes.json()) as { session: { status: string } };
    expect(handoffPayload.session.status).toBe("needs_human");

    const outcomeRes = await app.request(
      "/api/daemon/outcome",
      signedJson("/api/daemon/outcome", {
        runtimeId: "runtime_1",
        leaseId: leasePayload.lease.leaseId,
        sessionId: "session_1",
        outcome: {
          id: "outcome_1",
          sessionId: "session_1",
          status: "success",
          summary: "Lease handling path verified",
          result: { changed: false },
          eventsUploaded: 1,
          createdAt: later
        }
      }, daemon, later)
    );
    const outcomePayload = (await outcomeRes.json()) as { session: { status: string; outcomeId: string } };
    expect(outcomePayload.session.status).toBe("completed");
    expect(outcomePayload.session.outcomeId).toBe("outcome_1");
  });

  it("rejects daemon event uploads that do not match the active lease", async () => {
    const store = new MemoryStore();
    const app = createApp({ store, now: () => new Date(now) });

    await app.request("/api/runtimes", json({ id: "runtime_1", name: "Remote", mode: "remote_daemon", provider: "pi" }));
    await app.request("/api/sessions", json({ id: "session_1", codebaseId: "codebase_1", runtimeId: "runtime_1" }));
    const daemon = await registerDaemon(app, "runtime_1", now);
    const leaseRes = await app.request("/api/daemon/lease", signedJson("/api/daemon/lease", { runtimeId: "runtime_1" }, daemon, now));
    const leasePayload = (await leaseRes.json()) as { lease: { leaseId: string } };

    const badUpload = await app.request(
      "/api/daemon/events",
      signedJson("/api/daemon/events", {
        runtimeId: "runtime_other",
        leaseId: leasePayload.lease.leaseId,
        sessionId: "session_1",
        events: [
          {
            id: "event_1",
            sessionId: "session_1",
            sequence: 0,
            kind: "runtime",
            summary: "Wrong runtime",
            createdAt: now
          }
        ]
      }, daemon, now)
    );

    expect(badUpload.status).toBe(403);
  });

  it("updates runtime status from daemon heartbeats", async () => {
    const store = new MemoryStore();
    const app = createApp({ store, now: () => new Date(now) });

    await app.request("/api/runtimes", json({ id: "runtime_1", name: "Remote", mode: "remote_daemon", provider: "pi" }));
    const daemon = await registerDaemon(app, "runtime_1", now);
    const heartbeat = await app.request(
      "/api/daemon/heartbeat",
      signedJson(
        "/api/daemon/heartbeat",
        { runtimeId: "runtime_1", status: "busy", activeSessions: 1, capacity: 3, observedAt: later },
        daemon,
        later
      )
    );

    const payload = (await heartbeat.json()) as { runtime: { status: string; activeSessions: number; capacity: number } };
    expect(payload.runtime.status).toBe("busy");
    expect(payload.runtime.activeSessions).toBe(1);
    expect(payload.runtime.capacity).toBe(3);
  });

  it("defaults createApp to SQLite storage at AUTOMOMO_DB_PATH", async () => {
    const dir = mkdtempSync(join(tmpdir(), "automomo-api-default-"));
    const dbPath = join(dir, "control-plane.sqlite");
    const previousDbPath = process.env.AUTOMOMO_DB_PATH;
    process.env.AUTOMOMO_DB_PATH = dbPath;

    try {
      const firstApp = createApp({ now: () => new Date(now) });
      await firstApp.request("/api/codebases", json({ id: "codebase_1", name: "automomo", provider: "git" }));

      const secondApp = createApp({ now: () => new Date(later) });
      const codebasesRes = await secondApp.request("/api/codebases");
      const codebasesPayload = (await codebasesRes.json()) as { codebases: Array<{ id: string }> };

      expect(codebasesPayload.codebases).toEqual([expect.objectContaining({ id: "codebase_1" })]);
    } finally {
      if (previousDbPath === undefined) {
        delete process.env.AUTOMOMO_DB_PATH;
      } else {
        process.env.AUTOMOMO_DB_PATH = previousDbPath;
      }
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("persists records and leases across SQLite-backed app instances", async () => {
    const dir = mkdtempSync(join(tmpdir(), "automomo-api-"));
    const dbPath = join(dir, "control-plane.sqlite");

    try {
      const firstApp = createApp({ store: new SQLiteStore({ path: dbPath }), now: () => new Date(now) });

      await firstApp.request("/api/codebases", json({ id: "codebase_1", name: "automomo", provider: "git" }));
      await firstApp.request(
        "/api/work-items",
        json({ id: "work_1", codebaseId: "codebase_1", title: "Persist SQLite state" })
      );
      await firstApp.request(
        "/api/agents",
        json({ id: "agent_1", name: "Reviewer", model: "gpt-5", instructions: "Inspect the codebase." })
      );
      await firstApp.request(
        "/api/runtimes",
        json({ id: "runtime_1", name: "Remote Pi", mode: "remote_daemon", provider: "pi", status: "online" })
      );
      const daemon = await registerDaemon(firstApp, "runtime_1", now);
      await firstApp.request(
        "/api/sessions",
        json({
          id: "session_1",
          codebaseId: "codebase_1",
          workItemId: "work_1",
          agentId: "agent_1",
          runtimeId: "runtime_1"
        })
      );
      await firstApp.request(
        "/api/orchestration-rules",
        json({
          id: "rule_1",
          codebaseId: "codebase_1",
          name: "Manual runtime queue",
          trigger: "manual",
          agentId: "agent_1",
          runtimeId: "runtime_1"
        })
      );

      const secondApp = createApp({ store: new SQLiteStore({ path: dbPath }), now: () => new Date(later) });
      const codebasesRes = await secondApp.request("/api/codebases");
      const codebasesPayload = (await codebasesRes.json()) as { codebases: Array<{ id: string }> };
      expect(codebasesPayload.codebases).toEqual([
        expect.objectContaining({
          id: "codebase_1",
          name: "automomo",
          provider: "git",
          status: "active",
          metadata: {},
          createdAt: now,
          updatedAt: now
        })
      ]);
      const rulesRes = await secondApp.request("/api/orchestration-rules");
      const rulesPayload = (await rulesRes.json()) as { orchestrationRules: Array<{ id: string; agentId?: string }> };
      expect(rulesPayload.orchestrationRules).toEqual([
        expect.objectContaining({ id: "rule_1", agentId: "agent_1", runtimeId: "runtime_1" })
      ]);

      const leaseRes = await secondApp.request("/api/daemon/lease", signedJson("/api/daemon/lease", { runtimeId: "runtime_1" }, daemon, later));
      const leasePayload = (await leaseRes.json()) as {
        lease: {
          leaseId: string;
          session: { id: string; status: string; leaseId: string };
          workItem?: { id: string };
          agent?: { id: string };
        };
      };
      expect(leasePayload.lease.session).toMatchObject({
        id: "session_1",
        status: "leased",
        leaseId: leasePayload.lease.leaseId
      });
      expect(leasePayload.lease.workItem?.id).toBe("work_1");
      expect(leasePayload.lease.agent?.id).toBe("agent_1");

      const thirdApp = createApp({ store: new SQLiteStore({ path: dbPath }), now: () => new Date(later) });
      const uploadRes = await thirdApp.request(
        "/api/daemon/events",
        signedJson("/api/daemon/events", {
          runtimeId: "runtime_1",
          leaseId: leasePayload.lease.leaseId,
          sessionId: "session_1",
          events: [
            {
              id: "event_1",
              sessionId: "session_1",
              sequence: 0,
              kind: "runtime",
              summary: "SQLite lease persisted",
              createdAt: later
            }
          ]
        }, daemon, later)
      );
      expect(uploadRes.status).toBe(200);

      const handoffRes = await thirdApp.request(
        "/api/sessions/session_1/handoff",
        json({ reason: "Need human review before finishing", note: "Check the generated outcome." })
      );
      expect(handoffRes.status).toBe(201);

      const outcomeRes = await thirdApp.request(
        "/api/daemon/outcome",
        signedJson("/api/daemon/outcome", {
          runtimeId: "runtime_1",
          leaseId: leasePayload.lease.leaseId,
          sessionId: "session_1",
          outcome: {
            id: "outcome_1",
            sessionId: "session_1",
            status: "success",
            summary: "SQLite persistence verified",
            result: { persisted: true },
            eventsUploaded: 1,
            createdAt: later
          }
        }, daemon, later)
      );
      expect(outcomeRes.status).toBe(200);

      const fourthApp = createApp({ store: new SQLiteStore({ path: dbPath }), now: () => new Date(later) });
      const sessionsRes = await fourthApp.request("/api/sessions");
      const sessionsPayload = (await sessionsRes.json()) as { sessions: Array<{ id: string; status: string; outcomeId?: string }> };
      expect(sessionsPayload.sessions).toEqual([
        expect.objectContaining({ id: "session_1", status: "completed", outcomeId: "outcome_1" })
      ]);
      const eventsRes = await fourthApp.request("/api/sessions/session_1/events");
      const eventsPayload = (await eventsRes.json()) as { events: Array<{ id: string; summary: string }> };
      expect(eventsPayload.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "event_1", summary: "SQLite lease persisted" })])
      );
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});

async function registerDaemon(app: ReturnType<typeof createApp>, runtimeId: string, timestamp: string) {
  const token = `runtime-admin-${runtimeId}-${timestamp}`;
  await app.request(
    "/api/api-keys",
    json({
      id: `key_${runtimeId}_${timestamp.replaceAll(/[^a-zA-Z0-9]/g, "_")}`,
      name: "Runtime admin",
      token,
      scopes: [{ actions: ["daemons:register", "runtimes:write"] }]
    })
  );
  const res = await app.request(
    "/api/daemon/register",
    json(
      { runtimeId, name: "Test daemon", provider: "pi", environment: { networkPolicy: "restricted", env: {}, secretRefs: [] } },
      { authorization: `Bearer ${token}` }
    )
  );
  const payload = (await res.json()) as { daemon: { id: string; runtimeId: string }; secret: string };
  return { ...payload, timestamp };
}

function signedJson(path: string, body: unknown, registration: { daemon: { id: string; runtimeId: string }; secret: string }, timestamp: string) {
  const bodyText = JSON.stringify(body);
  const bodyHash = createHash("sha256").update(bodyText).digest("hex");
  const nonce = createHash("sha256").update(`${path}:${timestamp}:${bodyText}`).digest("hex").slice(0, 16);
  const canonical = ["POST", path, timestamp, bodyHash, registration.daemon.id, registration.daemon.runtimeId, nonce].join("\n");
  const signature = createHmac("sha256", registration.secret).update(canonical).digest("hex");
  return json(body, {
    "x-automomo-daemon-id": registration.daemon.id,
    "x-automomo-runtime-id": registration.daemon.runtimeId,
    "x-automomo-timestamp": timestamp,
    "x-automomo-nonce": nonce,
    "x-automomo-signature": signature
  });
}
