import { describe, expect, it, vi } from "vitest"

const afterState = vi.hoisted(() => ({
  pending: [] as Promise<unknown>[],
}))

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return {
    ...actual,
    after: vi.fn((work: () => void | Promise<void>) => {
      afterState.pending.push(Promise.resolve().then(work))
    }),
  }
})

vi.mock("@/lib/auth-helper", () => {
  class AuthError extends Error {}
  class ForbiddenError extends Error {}

  return {
    AuthError,
    ForbiddenError,
    getAuthenticatedWorkspaceContext: vi.fn(async () => ({
      userId: "user_1",
      workspaceId: "workspace_1",
      role: "OWNER",
    })),
    unauthorizedResponse: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
    forbiddenResponse: (message = "Forbidden") => Response.json({ error: message }, { status: 403 }),
  }
})

import { POST as postMessage } from "../app/api/messages/route"
import { POST as postAgent } from "../app/api/agents/route"
import { getMentionDispatchTargets } from "../lib/mention-dispatch"
import { prisma } from "../lib/prisma"
import { withTestDatabase } from "./helpers/test-db"

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://automomo.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function drainAfterTasks() {
  while (afterState.pending.length > 0) {
    const pending = afterState.pending.splice(0)
    const results = await Promise.allSettled(pending)
    const rejection = results.find((result) => result.status === "rejected")
    if (rejection?.status === "rejected") throw rejection.reason
  }
}

async function seedRoom(input: {
  roomAgents?: Array<{ id: string; name: string; harness?: string }>
  otherAgents?: Array<{ id: string; name: string; harness?: string }>
} = {}) {
  afterState.pending.length = 0
  await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
  await prisma.user.create({
    data: { id: "user_1", name: "User", email: "user@example.com", passwordHash: "hash" },
  })
  await prisma.runtime.create({ data: { id: "runtime_1", name: "Runtime", workspaceRoot: "/repo" } })
  await prisma.room.create({
    data: { id: "room_1", name: "Room", workspaceId: "workspace_1", userId: "user_1" },
  })

  for (const agent of [...(input.roomAgents ?? []), ...(input.otherAgents ?? [])]) {
    await prisma.agent.create({
      data: {
        id: agent.id,
        name: agent.name,
        harness: agent.harness ?? "automomo-daemon",
        runtimeId: (agent.harness ?? "automomo-daemon") === "automomo-daemon" ? "runtime_1" : null,
        environmentId: "",
        workspaceId: "workspace_1",
      },
    })
  }

  for (const agent of input.roomAgents ?? []) {
    await prisma.roomAgent.create({
      data: { roomId: "room_1", agentId: agent.id },
    })
  }
}

async function sendHumanMessage(content: string) {
  const response = await postMessage(jsonRequest("/api/messages", { roomId: "room_1", content }))
  expect(response.status).toBe(200)
  await response.json()
  await drainAfterTasks()
}

describe("mention dispatch", () => {
  it("creates agents with the local daemon harness and runtime id by default", withTestDatabase(async () => {
    afterState.pending.length = 0
    await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
    await prisma.user.create({
      data: { id: "user_1", name: "User", email: "user@example.com", passwordHash: "hash" },
    })
    await prisma.runtime.create({ data: { id: "runtime_1", name: "Runtime", workspaceRoot: "/repo" } })

    const response = await postAgent(jsonRequest("/api/agents", {
      name: "Builder",
      role: "builder",
      description: "Implements focused changes",
      defaultEnvironmentId: "runtime_1",
      instructions: "Build carefully",
    }))
    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload).toMatchObject({
      name: "Builder",
      role: "builder",
      description: "Implements focused changes",
      harness: "automomo-daemon",
      runtimeId: "runtime_1",
      environmentId: "runtime_1",
      defaultEnvironmentId: "runtime_1",
      instructions: "Build carefully",
    })
  }))

  it("groups local daemon agents as first-class mention targets", withTestDatabase(async () => {
    await seedRoom({
      roomAgents: [
        { id: "agent_builder", name: "Builder" },
        { id: "agent_poll", name: "Poller", harness: "openclaw" },
      ],
    })

    const targets = await getMentionDispatchTargets({
      roomId: "room_1",
      content: "Please ask @Builder and @Poller.",
    })

    expect(targets.mentionedAgents.map((agent) => agent.name)).toEqual(["Builder", "Poller"])
    expect(targets.daemonAgents.map((agent) => agent.name)).toEqual(["Builder"])
    expect(targets.openClawAgents.map((agent) => agent.name)).toEqual(["Poller"])
  }))

  it("creates no AgentRun for a plain human message", withTestDatabase(async () => {
    await seedRoom({ roomAgents: [{ id: "agent_builder", name: "Builder" }] })

    await sendHumanMessage("Plain room update with no mention.")

    await expect(prisma.agentRun.count()).resolves.toBe(0)
  }))

  it("queues one local daemon run for one local mention", withTestDatabase(async () => {
    await seedRoom({ roomAgents: [{ id: "agent_builder", name: "Builder" }] })

    await sendHumanMessage("Please handle this, @Builder.")

    const runs = await prisma.agentRun.findMany({ orderBy: { createdAt: "asc" } })
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      agentId: "agent_builder",
      roomId: "room_1",
      runtimeId: "runtime_1",
      harness: "automomo-daemon",
      status: "queued",
    })
  }))

  it("queues one local daemon run for each distinct local mention", withTestDatabase(async () => {
    await seedRoom({
      roomAgents: [
        { id: "agent_builder", name: "Builder" },
        { id: "agent_reviewer", name: "Reviewer" },
      ],
    })

    await sendHumanMessage("Please split this up, @Builder and @Reviewer.")

    const runs = await prisma.agentRun.findMany({ orderBy: { agentId: "asc" } })
    expect(runs).toHaveLength(2)
    expect(runs.map((run) => run.agentId)).toEqual(["agent_builder", "agent_reviewer"])
    expect(new Set(runs.map((run) => run.id)).size).toBe(2)
  }))

  it("does not dispatch mentions for agents outside the room", withTestDatabase(async () => {
    await seedRoom({
      roomAgents: [{ id: "agent_builder", name: "Builder" }],
      otherAgents: [{ id: "agent_outside", name: "Outside" }],
    })

    await sendHumanMessage("Can @Outside take this?")

    await expect(prisma.agentRun.count()).resolves.toBe(0)
  }))

  it("deduplicates repeated mentions of the same local agent", withTestDatabase(async () => {
    await seedRoom({ roomAgents: [{ id: "agent_builder", name: "Builder" }] })

    await sendHumanMessage("@Builder please pair with @Builder on this.")

    const runs = await prisma.agentRun.findMany()
    expect(runs).toHaveLength(1)
    expect(runs[0].agentId).toBe("agent_builder")
  }))
})
