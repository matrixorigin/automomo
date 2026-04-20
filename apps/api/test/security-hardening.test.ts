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

  it("blocks unauthenticated local runtime setup and execution even when local execution is enabled without global API auth", async () => {
    const store = new MemoryStore();
    const app = createApp({ store, now: () => new Date(now), allowLocalExecution: true });
    store.createApiKey({
      id: "key_runtime",
      name: "Runtime operator",
      token: "runtime-token",
      scopes: [{ actions: ["runtimes:write"] }, { codebaseId: "codebase_1", actions: ["sessions:write", "runtime:execute"] }],
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

    const localRuntime = await app.request(
      "/api/runtimes",
      json({
        id: "runtime_attacker",
        name: "Attacker shell",
        mode: "local",
        provider: "shell",
        environment: { command: [process.execPath, "-e", "console.log('pwned')"], networkPolicy: "restricted", env: {}, secretRefs: [] }
      })
    );
    const localSession = await app.request(
      "/api/sessions",
      json({ id: "session_attacker", codebaseId: "codebase_1", runtimeId: "runtime_1", status: "queued" })
    );
    const localRun = await app.request("/api/sessions/session_1/run-local", json({ provider: "shell" }));

    expect(localRuntime.status).toBe(401);
    expect(localSession.status).toBe(401);
    expect(localRun.status).toBe(401);

    const authorizedRun = await app.request("/api/sessions/session_1/run-local", json({ provider: "shell" }, auth("runtime-token")));
    expect(authorizedRun.status).toBe(200);
  });

  it("redacts secret values from local, manual, and daemon persistence paths", async () => {
    const secret = "super-secret-value";
    const store = new MemoryStore();
    const app = createApp({ store, now: () => new Date(now), allowLocalExecution: true, requireApiKey: true });
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
      id: "runtime_local",
      name: "Secret shell",
      mode: "local",
      provider: "shell",
      environment: {
        command: [
          process.execPath,
          "-e",
          `console.log(JSON.stringify({status:'success',summary:'local ${secret}',result:{nested:{message:'token=${secret}'}}}))`
        ],
        networkPolicy: "restricted",
        env: { PRIVATE_TOKEN: secret },
        secretRefs: ["PRIVATE_TOKEN"]
      },
      status: "online",
      capacity: 1,
      activeSessions: 0,
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    store.saveSession({
      id: "session_local",
      codebaseId: "codebase_1",
      runtimeId: "runtime_local",
      status: "queued",
      participants: [],
      metadata: {},
      createdAt: now,
      updatedAt: now
    });

    const localRun = await app.request("/api/sessions/session_local/run-local", json({ provider: "shell" }, auth("admin-token")));
    expect(localRun.status).toBe(200);
    const localPayload = await localRun.json();
    expect(JSON.stringify(localPayload)).not.toContain(secret);
    expect(JSON.stringify(localPayload)).toContain("[REDACTED]");

    store.saveSession({
      id: "session_manual",
      codebaseId: "codebase_1",
      runtimeId: "runtime_local",
      status: "queued",
      participants: [],
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    const manualOutcome = await app.request(
      "/api/sessions/session_manual/outcome",
      json(
        {
          status: "success",
          summary: `manual ${secret}`,
          result: { nested: { message: `value ${secret}` }, array: [`${secret}`] }
        },
        auth("admin-token")
      )
    );
    expect(manualOutcome.status).toBe(201);
    const manualPayload = await manualOutcome.json();
    expect(JSON.stringify(manualPayload)).not.toContain(secret);

    const registration = await registerDaemon(app, "runtime_daemon", undefined, auth("admin-token"), {
      PRIVATE_TOKEN: secret
    });
    store.saveSession({
      id: "session_daemon_events",
      codebaseId: "codebase_1",
      runtimeId: "runtime_daemon",
      status: "queued",
      participants: [],
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    const lease = await app.request(
      "/api/daemon/lease",
      signedJson("/api/daemon/lease", { runtimeId: "runtime_daemon" }, registration, now, "nonce_secret_lease")
    );
    const leasePayload = (await lease.json()) as { lease: { leaseId: string } };
    const eventUpload = await app.request(
      "/api/daemon/events",
      signedJson(
        "/api/daemon/events",
        {
          runtimeId: "runtime_daemon",
          leaseId: leasePayload.lease.leaseId,
          sessionId: "session_daemon_events",
          events: [
            {
              id: "event_daemon_secret",
              sessionId: "session_daemon_events",
              sequence: 0,
              kind: "runtime",
              summary: `daemon ${secret}`,
              detail: `detail ${secret}`,
              metadata: { nested: { message: `metadata ${secret}` } },
              createdAt: now
            }
          ]
        },
        registration,
        oneMinuteLater,
        "nonce_secret_events"
      )
    );
    expect(eventUpload.status).toBe(200);
    const outcomeUpload = await app.request(
      "/api/daemon/outcome",
      signedJson(
        "/api/daemon/outcome",
        {
          runtimeId: "runtime_daemon",
          leaseId: leasePayload.lease.leaseId,
          sessionId: "session_daemon_events",
          outcome: {
            id: "outcome_daemon_secret",
            sessionId: "session_daemon_events",
            status: "success",
            summary: `daemon outcome ${secret}`,
            result: { nested: { message: `outcome ${secret}` } },
            eventsUploaded: 1,
            createdAt: now
          }
        },
        registration,
        oneMinuteLater,
        "nonce_secret_outcome"
      )
    );
    expect(outcomeUpload.status).toBe(200);

    store.saveSession({
      id: "session_daemon_fail",
      codebaseId: "codebase_1",
      runtimeId: "runtime_daemon",
      status: "queued",
      participants: [],
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    const failureLease = await app.request(
      "/api/daemon/lease",
      signedJson("/api/daemon/lease", { runtimeId: "runtime_daemon" }, registration, now, "nonce_failure_lease")
    );
    const failureLeasePayload = (await failureLease.json()) as { lease: { leaseId: string } };
    const failureUpload = await app.request(
      "/api/daemon/fail",
      signedJson(
        "/api/daemon/fail",
        {
          runtimeId: "runtime_daemon",
          leaseId: failureLeasePayload.lease.leaseId,
          sessionId: "session_daemon_fail",
          reason: `failed ${secret}`,
          detail: `detail ${secret}`,
          metadata: { nested: { message: `metadata ${secret}` } }
        },
        registration,
        oneMinuteLater,
        "nonce_secret_fail"
      )
    );
    expect(failureUpload.status).toBe(200);

    expect(JSON.stringify(store.listSessionEvents("session_daemon_events"))).not.toContain(secret);
    expect(JSON.stringify(store.getOutcome("outcome_daemon_secret"))).not.toContain(secret);
    expect(JSON.stringify(store.listSessionEvents("session_daemon_fail"))).not.toContain(secret);
  });
});

describe("daemon signed request hardening", () => {
  it("binds signed daemon calls to the body runtime and prevents cross-daemon lease renewal or failure", async () => {
    const store = new MemoryStore();
    const app = createApp({ store, now: () => new Date(now) });
    store.createApiKey({
      id: "key_runtime_admin",
      name: "Runtime admin",
      token: "runtime-admin-token",
      scopes: [{ actions: ["daemons:register", "runtimes:write"] }],
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    await app.request("/api/runtimes", json({ id: "runtime_1", name: "Runtime 1", mode: "remote_daemon", provider: "pi" }));
    await app.request("/api/runtimes", json({ id: "runtime_2", name: "Runtime 2", mode: "remote_daemon", provider: "pi" }));
    await app.request("/api/sessions", json({ id: "session_1", codebaseId: "codebase_1", runtimeId: "runtime_1" }));
    await app.request("/api/sessions", json({ id: "session_2", codebaseId: "codebase_1", runtimeId: "runtime_2" }));

    const daemonOne = await registerDaemon(app, "runtime_1", undefined, auth("runtime-admin-token"));
    const daemonTwo = await registerDaemon(app, "runtime_1", "daemon_2", auth("runtime-admin-token"));

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
    store.createApiKey({
      id: "key_runtime_admin",
      name: "Runtime admin",
      token: "runtime-admin-token",
      scopes: [{ actions: ["daemons:register", "runtimes:write"] }],
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    await app.request("/api/runtimes", json({ id: "runtime_1", name: "Runtime", mode: "remote_daemon", provider: "pi" }));
    await app.request("/api/sessions", json({ id: "session_1", codebaseId: "codebase_1", runtimeId: "runtime_1" }));
    const daemon = await registerDaemon(app, "runtime_1", undefined, auth("runtime-admin-token"));
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

  it("does not let daemons:register alone rebind or rewrite an existing runtime", async () => {
    const store = new MemoryStore();
    const app = createApp({ store, now: () => new Date(now), requireApiKey: true });
    store.createApiKey({
      id: "key_daemon_register",
      name: "Daemon register only",
      token: "daemon-register-token",
      scopes: [{ actions: ["daemons:register"] }],
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    store.createApiKey({
      id: "key_runtime_admin",
      name: "Runtime admin",
      token: "runtime-admin-token",
      scopes: [{ actions: ["daemons:register", "runtimes:write"] }],
      metadata: {},
      createdAt: now,
      updatedAt: now
    });
    store.saveRuntime({
      id: "runtime_existing",
      name: "Existing runtime",
      mode: "remote_daemon",
      provider: "pi",
      environment: { networkPolicy: "restricted", env: {}, secretRefs: [] },
      status: "offline",
      capacity: 3,
      activeSessions: 0,
      metadata: { owner: "trusted" },
      createdAt: now,
      updatedAt: now
    });

    const scopedOnly = await app.request(
      "/api/daemon/register",
      json({ runtimeId: "runtime_existing", name: "Untrusted rewrite", provider: "shell" }, auth("daemon-register-token"))
    );
    expect(scopedOnly.status).toBe(403);
    expect(store.getRuntime("runtime_existing")).toMatchObject({
      name: "Existing runtime",
      provider: "pi",
      status: "offline",
      capacity: 3,
      metadata: { owner: "trusted" }
    });

    const runtimeAdmin = await app.request(
      "/api/daemon/register",
      json({ runtimeId: "runtime_existing", name: "Trusted daemon", provider: "pi" }, auth("runtime-admin-token"))
    );
    expect(runtimeAdmin.status).toBe(200);
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

  it("rejects unsigned GitHub webhooks when no secret or insecure local mode is configured", async () => {
    const store = new MemoryStore();
    const app = createApp({
      store,
      now: () => new Date(now),
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
    });
    store.saveCodebase({
      id: "matrixorigin/automomo",
      name: "automomo",
      provider: "github",
      sourceUrl: "https://github.com/matrixorigin/automomo",
      status: "active",
      metadata: {},
      createdAt: now,
      updatedAt: now
    });

    const response = await app.request(
      "/api/webhooks/github",
      json({ repository: { owner: { login: "matrixorigin" }, name: "automomo" }, issue: { number: 42 } }, { "x-github-event": "issues" })
    );

    expect(response.status).toBe(401);
  });

  it("does not create duplicate active sessions or regress active work status for repeated connector events", async () => {
    const store = new MemoryStore();
    const app = createApp({
      store,
      now: () => new Date(now),
      allowInsecureGitHubWebhooks: true,
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
      createApp({ store, now: () => new Date(now), trustLocalExecutionWithoutAuth: true })
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

async function registerDaemon(
  app: ReturnType<typeof createApp>,
  runtimeId: string,
  daemonId?: string,
  headers: Record<string, string> = {},
  env: Record<string, string> = {}
) {
  const res = await app.request(
    "/api/daemon/register",
    json(
      {
        daemonId,
        runtimeId,
        name: `Daemon ${daemonId ?? runtimeId}`,
        provider: "pi",
        environment: { networkPolicy: "restricted", env, secretRefs: Object.keys(env) }
      },
      headers
    )
  );
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
