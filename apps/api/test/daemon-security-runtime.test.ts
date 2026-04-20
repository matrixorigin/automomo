import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/store";

const now = "2026-04-20T08:00:00.000Z";
const later = "2026-04-20T08:01:00.000Z";

function json(body: unknown, headers: Record<string, string> = {}) {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  };
}

describe("daemon identity, security, ingress, and local runtime execution", () => {
  it("rejects unsigned daemon lease calls, accepts signed calls, renews leases, and records failure uploads", async () => {
    const app = createApp({ store: new MemoryStore(), now: () => new Date(now) });
    await app.request("/api/sessions", json({ id: "session_1", codebaseId: "codebase_1", runtimeId: "runtime_1" }));

    const register = await app.request(
      "/api/daemon/register",
      json({ runtimeId: "runtime_1", name: "Local daemon", provider: "pi" })
    );
    const registration = (await register.json()) as {
      daemon: { id: string; runtimeId: string };
      runtime: { id: string };
      secret: string;
    };

    const unsigned = await app.request("/api/daemon/lease", json({ runtimeId: "runtime_1" }));
    expect(unsigned.status).toBe(401);

    const leaseBody = { runtimeId: "runtime_1" };
    const lease = await app.request(
      "/api/daemon/lease",
      json(leaseBody, await signedHeaders("POST", "/api/daemon/lease", leaseBody, registration.daemon.id, "runtime_1", registration.secret, now))
    );
    expect(lease.status).toBe(200);
    const leasePayload = (await lease.json()) as { lease: { leaseId: string; session: { id: string } } };
    expect(leasePayload.lease.session.id).toBe("session_1");

    const renewBody = { runtimeId: "runtime_1", leaseId: leasePayload.lease.leaseId };
    const renew = await app.request(
      "/api/daemon/lease/renew",
      json(renewBody, await signedHeaders("POST", "/api/daemon/lease/renew", renewBody, registration.daemon.id, "runtime_1", registration.secret, later))
    );
    expect(renew.status).toBe(200);
    const renewPayload = (await renew.json()) as { lease: { renewedAt?: string } };
    expect(renewPayload.lease.renewedAt).toBe(now);

    const failBody = {
      runtimeId: "runtime_1",
      leaseId: leasePayload.lease.leaseId,
      sessionId: "session_1",
      reason: "Runtime command failed",
      detail: "exit 1"
    };
    const fail = await app.request(
      "/api/daemon/fail",
      json(failBody, await signedHeaders("POST", "/api/daemon/fail", failBody, registration.daemon.id, "runtime_1", registration.secret, later))
    );
    expect(fail.status).toBe(200);
    const failPayload = (await fail.json()) as { session: { status: string } };
    expect(failPayload.session.status).toBe("failed");
  });

  it("upserts GitHub webhook events through source-neutral work item ingress", async () => {
    const app = createApp({
      store: new MemoryStore(),
      now: () => new Date(now),
      allowInsecureGitHubWebhooks: true,
      githubFetch: async () =>
        Response.json({
          title: "Fresh issue title",
          body: "Fresh issue body",
          labels: [{ name: "runtime" }],
          html_url: "https://github.com/matrixorigin/automomo/issues/42",
          node_id: "node_42",
          state: "open",
          user: { login: "octo" },
          updated_at: later
        })
    });
    await app.request(
      "/api/codebases",
      json({ id: "codebase_1", name: "automomo", provider: "github", sourceUrl: "https://github.com/matrixorigin/automomo" })
    );

    const body = {
      action: "opened",
      repository: { owner: { login: "matrixorigin" }, name: "automomo" },
      issue: { number: 42 },
      codebaseId: "codebase_1"
    };
    const first = await app.request("/api/webhooks/github", json(body, { "x-github-event": "issues" }));
    const second = await app.request("/api/webhooks/github", json(body, { "x-github-event": "issues" }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstPayload = (await first.json()) as { workItem: { id: string; connector?: { metadata: any } } };
    const secondPayload = (await second.json()) as { workItem: { id: string } };
    expect(secondPayload.workItem.id).toBe(firstPayload.workItem.id);
    expect(firstPayload.workItem.connector?.metadata).toMatchObject({
      owner: "matrixorigin",
      repo: "automomo",
      issueNumber: 42,
      sourceUrl: "https://github.com/matrixorigin/automomo/issues/42"
    });
  });

  it("runs a co-located shell runtime and stores a structured outcome", async () => {
    const dir = mkdtempSync(join(tmpdir(), "automomo-shell-runtime-"));
    try {
      const app = createApp({
        store: new MemoryStore(),
        now: () => new Date(now),
        allowLocalExecution: true,
        trustLocalExecutionWithoutAuth: true
      });
      await app.request("/api/codebases", json({ id: "codebase_1", name: "automomo", provider: "local", workspaceRoot: dir }));
      await app.request("/api/work-items", json({ id: "work_1", codebaseId: "codebase_1", title: "Run shell" }));
      await app.request(
        "/api/runtimes",
        json({
          id: "runtime_1",
          name: "Shell runtime",
          mode: "local",
          provider: "shell",
          environment: {
            workspaceRoot: dir,
            command: [
              process.execPath,
              "-e",
              "console.log(JSON.stringify({status:'success',summary:'Shell completed',result:{ok:true}}))"
            ],
            networkPolicy: "disabled",
            env: {},
            secretRefs: []
          }
        })
      );
      await app.request(
        "/api/sessions",
        json({ id: "session_1", codebaseId: "codebase_1", workItemId: "work_1", runtimeId: "runtime_1", status: "queued" })
      );

      const run = await app.request("/api/sessions/session_1/run-local", json({ provider: "shell" }));
      expect(run.status).toBe(200);
      const payload = (await run.json()) as { outcome: { status: string; result: any }; session: { status: string } };
      expect(payload.outcome).toMatchObject({ status: "success", result: { ok: true } });
      expect(payload.session.status).toBe("completed");
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("enforces API key scope, rate limits webhooks, audits writes, and redacts secrets", async () => {
    const store = new MemoryStore();
    const app = createApp({
      store,
      now: () => new Date(now),
      requireApiKey: true,
      allowInsecureGitHubWebhooks: true,
      rateLimit: { limit: 1, windowMs: 60_000 }
    });
    await store.createApiKey({
      id: "key_1",
      name: "Codebase key",
      token: "valid-token",
      scopes: [{ codebaseId: "codebase_1", actions: ["work_items:write", "sessions:write"] }, { actions: ["runtimes:write"] }],
      createdAt: now,
      updatedAt: now
    });

    const missing = await app.request("/api/work-items", json({ id: "work_1", codebaseId: "codebase_1", title: "Missing key" }));
    expect(missing.status).toBe(401);

    const wrongScope = await app.request(
      "/api/work-items",
      json({ id: "work_1", codebaseId: "codebase_2", title: "Wrong scope" }, { authorization: "Bearer valid-token" })
    );
    expect(wrongScope.status).toBe(403);

    const ok = await app.request(
      "/api/work-items",
      json({ id: "work_1", codebaseId: "codebase_1", title: "Allowed" }, { authorization: "Bearer valid-token" })
    );
    expect(ok.status).toBe(201);
    expect(store.listAuditEvents().map((event) => event.action)).toContain("work_item.upsert");

    await app.request(
      "/api/runtimes",
      json(
        {
          id: "runtime_1",
          name: "Secret runtime",
          mode: "local",
          provider: "shell",
          environment: { networkPolicy: "restricted", env: {}, secretRefs: ["PRIVATE_TOKEN"] }
        },
        { authorization: "Bearer valid-token" }
      )
    );
    await app.request(
      "/api/sessions",
      json({ id: "session_1", codebaseId: "codebase_1", runtimeId: "runtime_1" }, { authorization: "Bearer valid-token" })
    );
    await app.request(
      "/api/sessions/session_1/events",
      json(
        {
          events: [
            {
              id: "event_1",
              sessionId: "session_1",
              sequence: 0,
              kind: "runtime",
              summary: "Stored env",
              metadata: { PRIVATE_TOKEN: "super-secret", nested: { authorization: "bearer abc" } },
              createdAt: now
            }
          ]
        },
        { authorization: "Bearer valid-token" }
      )
    );
    const events = await app.request("/api/sessions/session_1/events");
    const eventPayload = (await events.json()) as { events: Array<{ metadata: any }> };
    expect(eventPayload.events[0]?.metadata).toEqual({
      PRIVATE_TOKEN: "[REDACTED]",
      nested: { authorization: "[REDACTED]" }
    });

    const webhookBody = { repository: { owner: { login: "matrixorigin" }, name: "automomo" }, issue: { number: 1 } };
    const firstWebhook = await app.request("/api/webhooks/github", json(webhookBody, { "x-github-event": "issues" }));
    const limitedWebhook = await app.request("/api/webhooks/github", json(webhookBody, { "x-github-event": "issues" }));
    expect(firstWebhook.status).not.toBe(429);
    expect(limitedWebhook.status).toBe(429);
  });
});

async function signedHeaders(
  method: string,
  path: string,
  body: unknown,
  daemonId: string,
  runtimeId: string,
  secret: string,
  timestamp: string
) {
  const bodyText = JSON.stringify(body);
  const bodyHash = await digest(bodyText);
  const nonce = (await digest(`${method}:${path}:${timestamp}:${bodyText}`)).slice(0, 16);
  const canonical = [method, path, timestamp, bodyHash, daemonId, runtimeId, nonce].join("\n");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical));
  return {
    "x-automomo-daemon-id": daemonId,
    "x-automomo-runtime-id": runtimeId,
    "x-automomo-timestamp": timestamp,
    "x-automomo-nonce": nonce,
    "x-automomo-signature": hex(signature)
  };
}

async function digest(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
