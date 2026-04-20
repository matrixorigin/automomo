import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/store";

const now = "2026-04-20T08:00:00.000Z";

function json(body: unknown) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

async function seedRuntimeAndAgent(app: ReturnType<typeof createApp>) {
  await app.request("/api/codebases", json({ id: "codebase_1", name: "automomo", provider: "git" }));
  await app.request("/api/runtimes", json({ id: "runtime_1", name: "Local Pi", mode: "local", provider: "pi" }));
  await app.request(
    "/api/agents",
    json({ id: "agent_1", name: "Ralph", defaultRuntimeId: "runtime_1", instructions: "Work carefully." })
  );
}

describe("orchestration evaluation and session detail", () => {
  it("auto-starts a queued session when an enabled rule matches a work item", async () => {
    const app = createApp({ store: new MemoryStore(), now: () => new Date(now) });
    await seedRuntimeAndAgent(app);
    await app.request(
      "/api/orchestration-rules",
      json({
        id: "rule_1",
        codebaseId: "codebase_1",
        name: "Runtime work",
        trigger: "manual",
        match: { labels: ["runtime"], priority: "urgent" },
        agentId: "agent_1",
        runtimeId: "runtime_1",
        humanApproval: "never",
        createdAt: now,
        updatedAt: now
      })
    );

    const res = await app.request(
      "/api/work-items",
      json({
        id: "work_1",
        codebaseId: "codebase_1",
        title: "Fix runtime lease",
        priority: "urgent",
        labels: ["runtime"]
      })
    );
    const payload = (await res.json()) as {
      workItem: { status: string };
      sessionStart?: { session: { status: string; agentId?: string; runtimeId?: string; metadata: any }; evaluation: { ruleId?: string } };
    };

    expect(payload.workItem.status).toBe("ready");
    expect(payload.sessionStart?.session).toMatchObject({
      status: "queued",
      agentId: "agent_1",
      runtimeId: "runtime_1",
      metadata: { orchestration: expect.objectContaining({ ruleId: "rule_1" }) }
    });
    expect(payload.sessionStart?.evaluation.ruleId).toBe("rule_1");
  });

  it("marks matching work as needs_human when approval is required before start", async () => {
    const app = createApp({ store: new MemoryStore(), now: () => new Date(now) });
    await seedRuntimeAndAgent(app);
    await app.request(
      "/api/orchestration-rules",
      json({
        id: "rule_human",
        codebaseId: "codebase_1",
        name: "Human approval first",
        trigger: "api",
        match: { source: "api" },
        agentId: "agent_1",
        humanApproval: "before_start"
      })
    );

    const res = await app.request(
      "/api/work-items",
      json({ id: "work_1", codebaseId: "codebase_1", title: "Needs approval", source: "api" })
    );
    const payload = (await res.json()) as { workItem: { status: string }; sessionStart?: { session: { status: string } } };
    expect(payload.workItem.status).toBe("needs_human");
    expect(payload.sessionStart?.session.status).toBe("needs_human");
  });

  it("does not start sessions for disabled or non-matching rules", async () => {
    const app = createApp({ store: new MemoryStore(), now: () => new Date(now) });
    await seedRuntimeAndAgent(app);
    await app.request(
      "/api/orchestration-rules",
      json({
        id: "rule_disabled",
        codebaseId: "codebase_1",
        name: "Disabled",
        enabled: false,
        trigger: "manual",
        match: { labels: ["runtime"] },
        agentId: "agent_1"
      })
    );

    const res = await app.request(
      "/api/work-items",
      json({ id: "work_1", codebaseId: "codebase_1", title: "Ignored runtime", labels: ["runtime"] })
    );
    const payload = (await res.json()) as { sessionStart?: unknown };
    expect(payload.sessionStart).toBeUndefined();

    const sessions = await app.request("/api/sessions");
    const sessionPayload = (await sessions.json()) as { items: unknown[] };
    expect(sessionPayload.items).toEqual([]);
  });

  it("returns session detail with timeline, handoffs, outcome, and related records", async () => {
    const app = createApp({ store: new MemoryStore(), now: () => new Date(now) });
    await seedRuntimeAndAgent(app);
    await app.request("/api/work-items", json({ id: "work_1", codebaseId: "codebase_1", title: "Inspect session" }));
    await app.request(
      "/api/sessions",
      json({ id: "session_1", codebaseId: "codebase_1", workItemId: "work_1", agentId: "agent_1", runtimeId: "runtime_1" })
    );
    await app.request(
      "/api/sessions/session_1/events",
      json({
        events: [
          { id: "event_1", sessionId: "session_1", sequence: 0, kind: "runtime", summary: "Started", createdAt: now }
        ]
      })
    );
    await app.request("/api/sessions/session_1/handoff", json({ action: "request", reason: "Need input" }));
    await app.request("/api/sessions/session_1/handoff", json({ action: "claim", reason: "Taking over", claimedBy: "randomradio" }));
    await app.request("/api/sessions/session_1/handoff", json({ action: "respond", note: "Ready to continue", claimedBy: "randomradio" }));
    await app.request("/api/sessions/session_1/resume", json({ note: "Continue" }));
    await app.request(
      "/api/sessions/session_1/outcome",
      json({ id: "outcome_1", status: "success", summary: "Finished", result: { ok: true } })
    );

    const detailRes = await app.request("/api/sessions/session_1");
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as {
      session: { status: string; outcomeId?: string };
      events: Array<{ kind: string }>;
      handoffs: Array<{ status: string }>;
      outcome?: { id: string };
      workItem?: { id: string };
      agent?: { id: string };
      runtime?: { id: string };
    };

    expect(detail.session).toMatchObject({ status: "completed", outcomeId: "outcome_1" });
    expect(detail.events.map((event) => event.kind)).toContain("handoff");
    expect(detail.handoffs.map((handoff) => handoff.status)).toEqual(["requested", "claimed", "responded", "resumed"]);
    expect(detail.outcome?.id).toBe("outcome_1");
    expect(detail.workItem?.id).toBe("work_1");
    expect(detail.agent?.id).toBe("agent_1");
    expect(detail.runtime?.id).toBe("runtime_1");
  });
});
