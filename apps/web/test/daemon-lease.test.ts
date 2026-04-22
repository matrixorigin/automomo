import { describe, expect, it, vi } from "vitest"
import { prisma } from "../lib/prisma"
import { buildDaemonSignature } from "../lib/daemon-auth"
import { eventBroadcaster } from "../lib/event-broadcaster"
import { POST as registerDaemon } from "../app/api/daemon/register/route"
import { POST as claimLease } from "../app/api/daemon/lease/route"
import { POST as renewLease } from "../app/api/daemon/lease/renew/route"
import { POST as uploadEvents } from "../app/api/daemon/events/route"
import { POST as uploadOutcome } from "../app/api/daemon/outcome/route"
import { POST as uploadFailure } from "../app/api/daemon/fail/route"
import { withTestDatabase } from "./helpers/test-db"

let nonceCounter = 0

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://automomo.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

function signedHeaders(
  path: string,
  body: unknown,
  identity: { daemonId: string; runtimeId: string; secret: string }
) {
  const bodyText = JSON.stringify(body)
  const timestamp = "2026-04-22T00:00:00.000Z"
  const nonce = `nonce-${++nonceCounter}-${path.replaceAll("/", "-")}`
  return {
    "x-automomo-daemon-id": identity.daemonId,
    "x-automomo-runtime-id": identity.runtimeId,
    "x-automomo-timestamp": timestamp,
    "x-automomo-nonce": nonce,
    "x-automomo-signature": buildDaemonSignature({
      method: "POST",
      path,
      timestamp,
      bodyText,
      daemonId: identity.daemonId,
      runtimeId: identity.runtimeId,
      nonce,
      secret: identity.secret,
    }),
  }
}

async function registerLocalDaemon(runtimeId = "runtime_1") {
  const response = await registerDaemon(
    jsonRequest("/api/daemon/register", {
      runtimeId,
      name: "Local daemon",
      provider: "pi",
      environment: { workspaceRoot: "/repo" },
    })
  )
  expect(response.status).toBe(201)
  const identity = await response.json()
  return {
    daemonId: identity.daemon.id as string,
    runtimeId,
    secret: identity.secret as string,
  }
}

async function seedQueuedRun(input: { runId?: string; createdAt?: Date } = {}) {
  await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
  await prisma.user.create({
    data: { id: "user_1", name: "User", email: "user@example.com", passwordHash: "hash" },
  })
  await prisma.room.create({
    data: { id: "room_1", name: "Room", workspaceId: "workspace_1", userId: "user_1" },
  })
  await prisma.message.create({
    data: {
      id: "msg_1",
      roomId: "room_1",
      authorType: "human",
      userId: "user_1",
      content: "Please build it",
    },
  })
  await prisma.runtime.create({ data: { id: "runtime_1", name: "Runtime", workspaceRoot: "/repo" } })
  await prisma.agent.create({
    data: {
      id: "agent_1",
      name: "Builder",
      harness: "automomo-daemon",
      runtimeId: "runtime_1",
      workspaceId: "workspace_1",
      skills: JSON.stringify(["typescript"]),
      mcpServers: JSON.stringify([{ name: "files" }]),
    },
  })
  await prisma.agentRun.create({
    data: {
      id: input.runId ?? "run_1",
      roomId: "room_1",
      agentId: "agent_1",
      runtimeId: "runtime_1",
      prompt: "Build it",
      sourceMessageId: "msg_1",
      createdAt: input.createdAt,
    },
  })
}

async function claimRun(identity: { daemonId: string; runtimeId: string; secret: string }) {
  const body = { runtimeId: identity.runtimeId }
  const response = await claimLease(
    jsonRequest("/api/daemon/lease", body, signedHeaders("/api/daemon/lease", body, identity))
  )
  expect(response.status).toBe(200)
  return response.json()
}

describe("daemon lease routes", () => {
  it("returns null when no queued runs exist", withTestDatabase(async () => {
    const identity = await registerLocalDaemon()
    const payload = await claimRun(identity)
    expect(payload).toEqual({ lease: null })
  }))

  it("claims the oldest queued AgentRun for the daemon runtime", withTestDatabase(async () => {
    await seedQueuedRun({ runId: "run_old", createdAt: new Date("2026-04-22T00:00:00.000Z") })
    await prisma.agentRun.create({
      data: {
        id: "run_new",
        roomId: "room_1",
        agentId: "agent_1",
        runtimeId: "runtime_1",
        prompt: "Build later",
        sourceMessageId: "msg_2",
        createdAt: new Date("2026-04-22T00:01:00.000Z"),
      },
    })

    const identity = await registerLocalDaemon()
    const payload = await claimRun(identity)
    expect(payload.lease.run.id).toBe("run_old")
    expect(payload.lease.agent).toMatchObject({
      id: "agent_1",
      name: "Builder",
      skills: ["typescript"],
    })
    expect(payload.lease.context[0]).toMatchObject({
      id: "msg_1",
      authorType: "human",
      authorName: "User",
      content: "Please build it",
    })

    const run = await prisma.agentRun.findUnique({ where: { id: "run_old" } })
    expect(run?.status).toBe("claimed")
    expect(run?.leaseExpiresAt).toBeInstanceOf(Date)
  }))

  it("renews an active lease owned by the daemon", withTestDatabase(async () => {
    await seedQueuedRun()
    const identity = await registerLocalDaemon()
    const leasePayload = await claimRun(identity)
    const renewBody = { runtimeId: "runtime_1", leaseId: leasePayload.lease.leaseId }
    const response = await renewLease(
      jsonRequest(
        "/api/daemon/lease/renew",
        renewBody,
        signedHeaders("/api/daemon/lease/renew", renewBody, identity)
      )
    )
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.leaseId).toBe(leasePayload.lease.leaseId)
    expect(Date.parse(payload.expiresAt)).toBeGreaterThan(Date.now())
  }))

  it("stores daemon event metadata for an active lease", withTestDatabase(async () => {
    await seedQueuedRun()
    const identity = await registerLocalDaemon()
    const leasePayload = await claimRun(identity)
    const eventBody = {
      runtimeId: "runtime_1",
      leaseId: leasePayload.lease.leaseId,
      runId: "run_1",
      events: [{ kind: "runtime", summary: "Started Pi runtime", metadata: { step: 1 } }],
    }
    const response = await uploadEvents(
      jsonRequest("/api/daemon/events", eventBody, signedHeaders("/api/daemon/events", eventBody, identity))
    )
    const run = await prisma.agentRun.findUnique({ where: { id: "run_1" } })
    expect(response.status).toBe(200)
    expect(JSON.parse(run?.metadataJson ?? "{}").events[0]).toMatchObject({
      kind: "runtime",
      summary: "Started Pi runtime",
      metadata: { step: 1 },
    })
  }))

  it("creates an agent room message when a leased run completes", withTestDatabase(async () => {
    await seedQueuedRun()
    const identity = await registerLocalDaemon()
    const leasePayload = await claimRun(identity)
    const broadcastSpy = vi.spyOn(eventBroadcaster, "broadcast")
    const outcomeBody = {
      runtimeId: "runtime_1",
      leaseId: leasePayload.lease.leaseId,
      runId: "run_1",
      content: "Done",
      outcome: { status: "success", summary: "Done", result: {} },
      artifacts: [
        {
          type: "patch",
          title: "Current diff",
          content: "diff --git a/file b/file",
          metadata: { command: "git diff", filesChanged: ["file"] },
        },
        {
          type: "review",
          title: "Review notes",
          content: "No blocking issues.",
        },
      ],
      sessionUrl: null,
    }
    const response = await uploadOutcome(
      jsonRequest("/api/daemon/outcome", outcomeBody, signedHeaders("/api/daemon/outcome", outcomeBody, identity))
    )
    expect(response.status).toBe(200)
    const [message, run, lease, artifacts] = await Promise.all([
      prisma.message.findUnique({ where: { id: "run_1" } }),
      prisma.agentRun.findUnique({ where: { id: "run_1" } }),
      prisma.agentRunLease.findUnique({ where: { id: leasePayload.lease.leaseId } }),
      prisma.artifact.findMany({ where: { roomId: "room_1" }, orderBy: { createdAt: "asc" } }),
    ])
    expect(message?.content).toBe("Done")
    expect(message?.authorId).toBe("agent_1")
    expect(run?.status).toBe("completed")
    expect(lease?.status).toBe("completed")
    expect(artifacts).toHaveLength(2)
    expect(artifacts[0]).toMatchObject({
      type: "patch",
      title: "Current diff",
      runId: "run_1",
      environmentId: "runtime_1",
      createdBy: "agent_1",
    })
    expect(JSON.parse(artifacts[0]?.metadataJson ?? "{}")).toMatchObject({
      command: "git diff",
      filesChanged: ["file"],
    })
    expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: "artifact",
      roomId: "room_1",
      data: expect.objectContaining({ type: "patch", title: "Current diff" }),
    }))
    broadcastSpy.mockRestore()
  }))

  it("rejects outcomes after lease expiration", withTestDatabase(async () => {
    await seedQueuedRun()
    const identity = await registerLocalDaemon()
    const leasePayload = await claimRun(identity)
    await prisma.agentRunLease.update({
      where: { id: leasePayload.lease.leaseId },
      data: { expiresAt: new Date("2020-01-01T00:00:00.000Z") },
    })
    const outcomeBody = {
      runtimeId: "runtime_1",
      leaseId: leasePayload.lease.leaseId,
      runId: "run_1",
      content: "Too late",
      outcome: { status: "success", summary: "Late", result: {} },
      sessionUrl: null,
    }
    const response = await uploadOutcome(
      jsonRequest("/api/daemon/outcome", outcomeBody, signedHeaders("/api/daemon/outcome", outcomeBody, identity))
    )
    const message = await prisma.message.findUnique({ where: { id: "run_1" } })
    expect(response.status).toBe(409)
    expect(message).toBeNull()
  }))

  it("marks a leased run failed and creates a room-visible error message", withTestDatabase(async () => {
    await seedQueuedRun()
    const identity = await registerLocalDaemon()
    const leasePayload = await claimRun(identity)
    const failBody = {
      runtimeId: "runtime_1",
      leaseId: leasePayload.lease.leaseId,
      runId: "run_1",
      reason: "Runtime crashed",
      detail: "exit code 1",
    }
    const response = await uploadFailure(
      jsonRequest("/api/daemon/fail", failBody, signedHeaders("/api/daemon/fail", failBody, identity))
    )
    expect(response.status).toBe(200)
    const [message, run, lease] = await Promise.all([
      prisma.message.findUnique({ where: { id: "run_1" } }),
      prisma.agentRun.findUnique({ where: { id: "run_1" } }),
      prisma.agentRunLease.findUnique({ where: { id: leasePayload.lease.leaseId } }),
    ])
    expect(message?.content).toContain("Runtime crashed")
    expect(run?.status).toBe("failed")
    expect(run?.failureReason).toContain("exit code 1")
    expect(lease?.status).toBe("failed")
  }))
})
