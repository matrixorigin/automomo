import { createPiRuntimeAdapter } from "@automomo/pi-runtime";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { POST as uploadEvents } from "@/app/api/daemon/events/route";
import { POST as uploadFailure } from "@/app/api/daemon/fail/route";
import { POST as heartbeatDaemon } from "@/app/api/daemon/heartbeat/route";
import { POST as claimLease } from "@/app/api/daemon/lease/route";
import { POST as renewLease } from "@/app/api/daemon/lease/renew/route";
import { POST as uploadOutcome } from "@/app/api/daemon/outcome/route";
import { POST as registerDaemon } from "@/app/api/daemon/register/route";
import { disconnectPrismaForTests, prisma } from "@/lib/prisma";
import { DaemonApiClient } from "../src/client";
import { DaemonWorker } from "../src/worker";

const now = "2026-04-22T00:00:00.000Z";
const later = "2026-04-22T00:01:00.000Z";
const webAppRoot = fileURLToPath(new URL("../../web/", import.meta.url));
const repoRoot = resolve(webAppRoot, "../..");

const daemonHandlers = new Map<string, (request: Request) => Promise<Response>>([
  ["/api/daemon/register", registerDaemon],
  ["/api/daemon/heartbeat", heartbeatDaemon],
  ["/api/daemon/lease", claimLease],
  ["/api/daemon/lease/renew", renewLease],
  ["/api/daemon/events", uploadEvents],
  ["/api/daemon/outcome", uploadOutcome],
  ["/api/daemon/fail", uploadFailure]
]);

function createWebDaemonFetch(uploadedBodies: Array<{ path: string; bodyText: string }>): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const handler = daemonHandlers.get(url.pathname);
    if (!handler) {
      return Response.json({ error: `Unhandled test route: ${url.pathname}` }, { status: 404 });
    }

    const bodyText = typeof init?.body === "string" ? init.body : "";
    if (url.pathname === "/api/daemon/events" || url.pathname === "/api/daemon/outcome" || url.pathname === "/api/daemon/fail") {
      uploadedBodies.push({ path: url.pathname, bodyText });
    }

    return handler(
      new Request(`http://automomo.test${url.pathname}${url.search}`, {
        method: init?.method ?? "POST",
        headers: init?.headers,
        body: bodyText
      })
    );
  };
}

function withWebTestDatabase<T>(fn: (input: { databaseUrl: string }) => Promise<T>) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "automomo-daemon-web-e2e-"));
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousTursoDatabaseUrl = process.env.TURSO_DATABASE_URL;
    const databaseUrl = `file:${join(dir, "test.sqlite")}`;
    process.env.DATABASE_URL = databaseUrl;
    process.env.TURSO_DATABASE_URL = databaseUrl;

    execFileSync(
      "pnpm",
      ["--filter", "@automomo/web", "exec", "prisma", "db", "push", "--schema", "prisma/schema.prisma", "--url", databaseUrl],
      { cwd: repoRoot, stdio: "pipe" }
    );

    try {
      return await fn({ databaseUrl });
    } finally {
      await disconnectPrismaForTests();
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousTursoDatabaseUrl === undefined) delete process.env.TURSO_DATABASE_URL;
      else process.env.TURSO_DATABASE_URL = previousTursoDatabaseUrl;
      rmSync(dir, { force: true, recursive: true });
    }
  };
}

async function seedRoomRun() {
  await prisma.workspace.create({ data: { id: "workspace_local", name: "Local Workspace" } });
  await prisma.user.create({
    data: { id: "user_local", name: "Human", email: "human@example.com", passwordHash: "hash" }
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: "workspace_local", userId: "user_local", role: "OWNER" }
  });
  await prisma.room.create({
    data: {
      id: "room_local",
      name: "Local Runtime Room",
      description: "Use the automomo repo as the Pi workspace.",
      workspaceId: "workspace_local",
      userId: "user_local"
    }
  });
  await prisma.message.create({
    data: {
      id: "message_local",
      roomId: "room_local",
      authorType: "human",
      userId: "user_local",
      content: "@Builder inspect the local runtime flow"
    }
  });
  await prisma.runtime.create({
    data: {
      id: "runtime_local",
      name: "Local automomo repo runtime",
      workspaceRoot: repoRoot,
      environmentJson: JSON.stringify({ workspaceRoot: repoRoot, networkPolicy: "restricted", env: {}, secretRefs: [] })
    }
  });
  await prisma.agent.createMany({
    data: [
      {
        id: "agent_builder",
        name: "Builder",
        harness: "automomo-daemon",
        runtimeId: "runtime_local",
        workspaceId: "workspace_local",
        systemPrompt: "Exercise the local runtime flow without uploading source files.",
        skills: JSON.stringify(["typescript"])
      },
      {
        id: "agent_reviewer",
        name: "Reviewer",
        harness: "automomo-daemon",
        runtimeId: "runtime_local",
        workspaceId: "workspace_local",
        systemPrompt: "Review local runtime results."
      }
    ]
  });
  await prisma.roomAgent.createMany({
    data: [
      { roomId: "room_local", agentId: "agent_builder" },
      { roomId: "room_local", agentId: "agent_reviewer" }
    ]
  });
  await prisma.agentRun.create({
    data: {
      id: "run_local",
      roomId: "room_local",
      agentId: "agent_builder",
      runtimeId: "runtime_local",
      sourceMessageId: "message_local",
      prompt: "@Builder inspect the local runtime flow"
    }
  });
}

describe("local machine runtime end-to-end", () => {
  it("claims an automomo AgentRun through web daemon routes and persists the Pi outcome as a room message", withWebTestDatabase(async () => {
    await seedRoomRun();

    const uploadedBodies: Array<{ path: string; bodyText: string }> = [];
    let clock = now;
    const api = new DaemonApiClient({
      baseUrl: "http://automomo.test",
      fetchImpl: createWebDaemonFetch(uploadedBodies),
      now: () => new Date(clock)
    });
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
      runId: "run_local",
      outcomeId: "outcome_run_local"
    });

    const [message, run, lease] = await Promise.all([
      prisma.message.findUnique({ where: { id: "run_local" } }),
      prisma.agentRun.findUnique({ where: { id: "run_local" } }),
      prisma.agentRunLease.findFirst({ where: { runId: "run_local" } })
    ]);
    expect(message).toMatchObject({
      id: "run_local",
      authorType: "agent",
      authorId: "agent_builder",
      content: "Pi runtime adapter completed metadata-only session"
    });
    expect(run).toMatchObject({
      status: "completed",
      responseMessageId: "run_local"
    });
    expect(lease).toMatchObject({ status: "completed" });

    const eventUpload = uploadedBodies.find((body) => body.path === "/api/daemon/events");
    const outcomeUpload = uploadedBodies.find((body) => body.path === "/api/daemon/outcome");
    expect(eventUpload?.bodyText).toContain("\"runId\":\"run_local\"");
    expect(outcomeUpload?.bodyText).toContain("\"runId\":\"run_local\"");
    expect(outcomeUpload?.bodyText).toContain("Pi runtime adapter completed metadata-only session");
    expect(uploadedBodies.map((body) => body.bodyText).join("\n")).not.toContain("export class DaemonWorker");
  }));
});
