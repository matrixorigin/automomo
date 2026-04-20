import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/store";

const now = "2026-04-20T08:00:00.000Z";
const oneMinuteLater = "2026-04-20T08:01:00.000Z";
const fourMinutesEarlier = "2026-04-20T07:57:00.000Z";
const tenMinutesEarlier = "2026-04-20T07:50:00.000Z";

function json(body: unknown, headers: Record<string, string> = {}) {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("secure API mutation controls", () => {
  it("requires an admin key or bootstrap token before minting API keys in secure mode", async () => {
    const store = new MemoryStore();
    const app = withEnv({ AUTOMOMO_BOOTSTRAP_TOKEN: "bootstrap-token" }, () =>
      createApp({ store, now: () => new Date(now), requireApiKey: true })
    );
    store.createApiKey({
      id: "key_scoped",
      name: "Scoped work key",
      token: "scoped-token",
      scopes: [{ codebaseId: "codebase_1", actions: ["work_items:write"] }],
      metadata: {},
      createdAt: now,
      updatedAt: now
    });

    const unauthenticated = await app.request(
      "/api/api-keys",
      json({ name: "Untrusted wildcard", scopes: [{ actions: ["*"] }] })
    );
    expect(unauthenticated.status).toBe(401);

    const scoped = await app.request(
      "/api/api-keys",
      json({ name: "Scoped wildcard", scopes: [{ actions: ["*"] }] }, auth("scoped-token"))
    );
    expect(scoped.status).toBe(403);

    const bootstrapped = await app.request(
      "/api/api-keys",
      json({ name: "Admin", scopes: [{ actions: ["*"] }] }, auth("bootstrap-token"))
    );
    expect(bootstrapped.status).toBe(201);
  });

  it("guards representative mutating routes when API keys are required", async () => {
    const store = new MemoryStore();
    const app = createApp({ store, now: () => new Date(now), requireApiKey: true });
    store.createApiKey({
      id: "key_admin",
      name: "Admin",
      token: "admin-token",
      scopes: [{ actions: ["*"] }],
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    store.saveRuntime({
      id: "runtime_1",
      name: "Shell",
      mode: "local",
      provider: "shell",
      environment: {
        command: [process.execPath, "-e", "console.log('{\"status\":\"success\",\"summary\":\"ok\",\"result\":{}}')"],
        networkPolicy: "restricted",
        env: {},
        secretRefs: []
      },
      status: "online",
      capacity: 1,
      activeSessions: 0,
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    store.saveSession({
      id: "session_1",
      codebaseId: "codebase_1",
      runtimeId: "runtime_1",
      status: "queued",
      participants: [],
      metadata: {},
      createdAt: now,
      updatedAt: now
    });

    const protectedRequests = [
      app.request("/api/codebases", json({ id: "codebase_1", name: "Automomo", provider: "git" })),
      app.request("/api/orchestration-rules", json({ codebaseId: "codebase_1", name: "Rule", trigger: "manual" })),
      app.request("/api/sessions", json({ id: "session_2", codebaseId: "codebase_1" })),
      app.request("/api/agents", json({ name: "Agent" })),
      app.request("/api/runtimes", json({ id: "runtime_2", name: "Runtime", mode: "local", provider: "shell" })),
      app.request("/api/sessions/session_1/handoff", json({ action: "request", reason: "Need input" })),
      app.request("/api/sessions/session_1/run-local", json({ provider: "shell" })),
      app.request("/api/daemon/register", json({ runtimeId: "runtime_1", name: "Daemon", provider: "pi" }))
    ];
    const statuses = await Promise.all(protectedRequests).then((responses) => responses.map((response) => response.status));
    expect(statuses).toEqual([401, 401, 401, 401, 401, 401, 401, 401]);

    const allowed = await app.request(
      "/api/codebases",
      json({ id: "codebase_1", name: "Automomo", provider: "git" }, auth("admin-token"))
    );
    expect(allowed.status).toBe(201);
  });

  it("keeps local runtime execution disabled unless explicitly enabled", async () => {
    const store = new MemoryStore();
    const app = createApp({ store, now: () => new Date(now), requireApiKey: true });
    store.createApiKey({
      id: "key_admin",
      name: "Admin",
      token: "admin-token",
      scopes: [{ actions: ["*"] }],
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    store.saveRuntime({
      id: "runtime_1",
      name: "Shell",
      mode: "local",
      provider: "shell",
      environment: {
        command: [process.execPath, "-e", "console.log('{\"status\":\"success\",\"summary\":\"ok\",\"result\":{}}')"],
        networkPolicy: "restricted",
        env: {},
        secretRefs: []
      },
      status: "online",
      capacity: 1,
      activeSessions: 0,
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    store.saveSession({
      id: "session_1",
      codebaseId: "codebase_1",
      runtimeId: "runtime_1",
      status: "queued",
      participants: [],
      metadata: {},
      createdAt: now,
      updatedAt: now
    });

    const response = await app.request("/api/sessions/session_1/run-local", json({ provider: "shell" }, auth("admin-token")));

    expect(response.status).toBe(403);
  });
});

describe("daemon signed request hardening", () => {
  it("binds signed daemon calls to the body runtime and prevents cross-daemon lease renewal or failure", async () => {
    const store = new MemoryStore();
    const app = createApp({ store, now: () => new Date(now) });
    await app.request("/api/runtimes", json({ id: "runtime_1", name: "Runtime 1", mode: "remote_daemon", provider: "pi" }));
    await app.request("/api/runtimes", json({ id: "runtime_2", name: "Runtime 2", mode: "remote_daemon", provider: "pi" }));
    await app.request("/api/sessions", json({ id: "session_1", codebaseId: "codebase_1", runtimeId: "runtime_1" }));
    await app.request("/api/sessions", json({ id: "session_2", codebaseId: "codebase_1", runtimeId: "runtime_2" }));

    const daemonOne = await registerDaemon(app, "runtime_1");
    const daemonTwo = await registerDaemon(app, "runtime_1", "daemon_2");

    const forgedBody = { runtimeId: "runtime_2" };
    const forged = await app.request(
      "/api/daemon/lease",
      signedJson("/api/daemon/lease", forgedBody, daemonOne, now, "nonce_forged")
    );
    expect(forged.status).toBe(403);

    const lease = await app.request(
      "/api/daemon/lease",
      signedJson("/api/daemon/lease", { runtimeId: "runtime_1" }, daemonOne, now, "nonce_lease")
    );
    expect(lease.status).toBe(200);
    const leasePayload = (await lease.json()) as { lease: { leaseId: string } };

    const stolenRenew = await app.request(
      "/api/daemon/lease/renew",
      signedJson(
        "/api/daemon/lease/renew",
        { runtimeId: "runtime_1", leaseId: leasePayload.lease.leaseId },
        daemonTwo,
        oneMinuteLater,
        "nonce_stolen_renew"
      )
    );
    expect(stolenRenew.status).toBe(409);

    const stolenFail = await app.request(
      "/api/daemon/fail",
      signedJson(
        "/api/daemon/fail",
        { runtimeId: "runtime_1", leaseId: leasePayload.lease.leaseId, sessionId: "session_1", reason: "stolen" },
        daemonTwo,
        oneMinuteLater,
        "nonce_stolen_fail"
      )
    );
    expect(stolenFail.status).toBe(409);
  });

  it("uses server time for lease renewal and rejects stale or replayed signed daemon calls", async () => {
    const store = new MemoryStore();
    let serverNow = now;
    const app = createApp({ store, now: () => new Date(serverNow) });
    await app.request("/api/runtimes", json({ id: "runtime_1", name: "Runtime", mode: "remote_daemon", provider: "pi" }));
    await app.request("/api/sessions", json({ id: "session_1", codebaseId: "codebase_1", runtimeId: "runtime_1" }));
    const daemon = await registerDaemon(app, "runtime_1");
    const lease = await app.request(
      "/api/daemon/lease",
      signedJson("/api/daemon/lease", { runtimeId: "runtime_1" }, daemon, now, "nonce_lease")
    );
    const leasePayload = (await lease.json()) as { lease: { leaseId: string } };

    serverNow = oneMinuteLater;
    const renewBody = { runtimeId: "runtime_1", leaseId: leasePayload.lease.leaseId };
    const renew = await app.request(
      "/api/daemon/lease/renew",
      signedJson("/api/daemon/lease/renew", renewBody, daemon, fourMinutesEarlier, "nonce_renew")
    );
    const renewPayload = (await renew.json()) as { lease: { renewedAt?: string } };
    expect(renewPayload.lease.renewedAt).toBe(oneMinuteLater);

    const stale = await app.request(
      "/api/daemon/heartbeat",
      signedJson(
        "/api/daemon/heartbeat",
        { runtimeId: "runtime_1", status: "online", activeSessions: 0, capacity: 1, observedAt: tenMinutesEarlier },
        daemon,
        tenMinutesEarlier,
        "nonce_stale"
      )
    );
    expect(stale.status).toBe(401);

    const heartbeatBody = { runtimeId: "runtime_1", status: "busy", activeSessions: 1, capacity: 1, observedAt: oneMinuteLater };
    const replayInit = signedJson("/api/daemon/heartbeat", heartbeatBody, daemon, oneMinuteLater, "nonce_replay");
    const first = await app.request("/api/daemon/heartbeat", replayInit);
    const second = await app.request("/api/daemon/heartbeat", replayInit);
    expect(first.status).toBe(200);
    expect(second.status).toBe(401);
  });
});

describe("GitHub webhook trust and idempotent source upserts", () => {
  it("requires GitHub HMAC signatures when configured and resolves codebases from server-side repo mapping", async () => {
    const store = new MemoryStore();
    const app = withEnv({ AUTOMOMO_GITHUB_WEBHOOK_SECRET: "github-secret" }, () =>
      createApp({
        store,
        now: () => new Date(now),
        requireApiKey: true,
        githubFetch: async () =>
          Response.json({
            title: "Fresh issue",
            body: "Fetched from GitHub",
            labels: [],
            html_url: "https://github.com/matrixorigin/automomo/issues/42",
            node_id: "node_42",
            state: "open",
            user: { login: "octo" },
            updated_at: now
          })
      })
    );
    store.saveCodebase({
      id: "trusted_codebase",
      name: "automomo",
      provider: "github",
      sourceUrl: "https://github.com/matrixorigin/automomo",
      status: "active",
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    const body = {
      action: "opened",
      repository: { owner: { login: "matrixorigin" }, name: "automomo" },
      issue: { number: 42 },
      codebaseId: "attacker_controlled_codebase"
    };

    const unsigned = await app.request("/api/webhooks/github", json(body, { "x-github-event": "issues" }));
    expect(unsigned.status).toBe(401);

    const signed = await app.request("/api/webhooks/github", githubWebhookJson(body, "github-secret"));
    expect(signed.status).toBe(200);
    const payload = (await signed.json()) as { workItem: { codebaseId: string } };
    expect(payload.workItem.codebaseId).toBe("trusted_codebase");
  });

  it("does not create duplicate active sessions or regress active work status for repeated connector events", async () => {
    const store = new MemoryStore();
    const app = createApp({
      store,
      now: () => new Date(now),
      githubFetch: async () =>
        Response.json({
          title: "Fresh issue",
          body: "Fetched from GitHub",
          labels: [{ name: "runtime" }],
          html_url: "https://github.com/matrixorigin/automomo/issues/42",
          node_id: "node_42",
          state: "open",
          user: { login: "octo" },
          updated_at: now
        })
    });
    await app.request("/api/codebases", json({ id: "matrixorigin/automomo", name: "automomo", provider: "github" }));
    await app.request("/api/agents", json({ id: "agent_1", name: "Agent" }));
    await app.request("/api/runtimes", json({ id: "runtime_1", name: "Runtime", mode: "remote_daemon", provider: "pi" }));
    await app.request(
      "/api/orchestration-rules",
      json({
        id: "rule_1",
        codebaseId: "matrixorigin/automomo",
        name: "Webhook rule",
        trigger: "webhook",
        agentId: "agent_1",
        runtimeId: "runtime_1",
        humanApproval: "never"
      })
    );
    const body = {
      action: "opened",
      repository: { owner: { login: "matrixorigin" }, name: "automomo" },
      issue: { number: 42 }
    };

    const first = await app.request("/api/webhooks/github", json(body, { "x-github-event": "issues" }));
    const second = await app.request("/api/webhooks/github", json(body, { "x-github-event": "issues" }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(store.listSessions().filter((session) => session.workItemId === store.listWorkItems()[0]?.id)).toHaveLength(1);
    expect(store.listWorkItems()[0]?.status).toBe("ready");
  });
});

describe("handoff and local runtime state machines", () => {
  it("rejects skipped handoff transitions and allows request, claim, respond, resume", async () => {
    const app = createApp({ store: new MemoryStore(), now: () => new Date(now) });
    await app.request("/api/sessions", json({ id: "session_1", codebaseId: "codebase_1" }));

    const skipped = await app.request("/api/sessions/session_1/handoff", json({ action: "resume", reason: "skip" }));
    expect(skipped.status).toBe(409);

    await expectStatus(app.request("/api/sessions/session_1/handoff", json({ action: "request", reason: "Need input" })), 201);
    await expectStatus(app.request("/api/sessions/session_1/handoff", json({ action: "claim", claimedBy: "mo" })), 201);
    await expectStatus(app.request("/api/sessions/session_1/handoff", json({ action: "respond", claimedBy: "mo", note: "Use option A" })), 201);
    const resumed = await app.request("/api/sessions/session_1/handoff", json({ action: "resume", reason: "answered" }));

    expect(resumed.status).toBe(201);
    const payload = (await resumed.json()) as { session: { status: string } };
    expect(payload.session.status).toBe("resumed_by_agent");
  });

  it("routes local Pi execution through the Pi adapter instead of falling through to shell", async () => {
    const store = new MemoryStore();
    const app = withEnv({ AUTOMOMO_ENABLE_LOCAL_EXECUTION: "true" }, () =>
      createApp({ store, now: () => new Date(now) })
    );
    await app.request("/api/runtimes", json({ id: "runtime_1", name: "Pi Runtime", mode: "local", provider: "pi" }));
    await app.request("/api/sessions", json({ id: "session_1", codebaseId: "codebase_1", runtimeId: "runtime_1" }));

    const response = await app.request("/api/sessions/session_1/run-local", json({ provider: "pi" }));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { outcome: { summary: string } };
    expect(payload.outcome.summary).toContain("Pi runtime adapter");
  });
});

async function expectStatus(responseOrPromise: Response | Promise<Response>, status: number) {
  const response = await responseOrPromise;
  expect(response.status).toBe(status);
}

async function registerDaemon(app: ReturnType<typeof createApp>, runtimeId: string, daemonId?: string) {
  const res = await app.request("/api/daemon/register", json({ daemonId, runtimeId, name: `Daemon ${daemonId ?? runtimeId}`, provider: "pi" }));
  const payload = (await res.json()) as { daemon: { id: string; runtimeId: string }; secret: string };
  return payload;
}

function signedJson(
  path: string,
  body: unknown,
  registration: { daemon: { id: string; runtimeId: string }; secret: string },
  timestamp: string,
  nonce: string
) {
  const bodyText = JSON.stringify(body);
  const bodyHash = createHash("sha256").update(bodyText).digest("hex");
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

function githubWebhookJson(body: unknown, secret: string) {
  const bodyText = JSON.stringify(body);
  const signature = `sha256=${createHmac("sha256", secret).update(bodyText).digest("hex")}`;
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": "issues",
      "x-hub-signature-256": signature
    },
    body: bodyText
  };
}

function withEnv<T>(values: Record<string, string | undefined>, fn: () => T): T {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
