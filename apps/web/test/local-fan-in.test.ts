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

import { completeAgentRun } from "../lib/agent-run-completion"
import { prisma } from "../lib/prisma"
import { withTestDatabase } from "./helpers/test-db"

async function drainAfterTasks() {
  while (afterState.pending.length > 0) {
    const pending = afterState.pending.splice(0)
    const results = await Promise.allSettled(pending)
    const rejection = results.find((result) => result.status === "rejected")
    if (rejection?.status === "rejected") throw rejection.reason
  }
}

async function seedLocalTeam() {
  afterState.pending.length = 0
  await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
  await prisma.user.create({
    data: { id: "user_1", name: "User", email: "user@example.com", passwordHash: "hash" },
  })
  await prisma.runtime.create({ data: { id: "runtime_1", name: "Runtime", workspaceRoot: "/repo" } })
  await prisma.room.create({
    data: { id: "room_1", name: "Room", workspaceId: "workspace_1", userId: "user_1" },
  })

  for (const agent of [
    { id: "agent_lead", name: "Lead" },
    { id: "agent_alpha", name: "Alpha" },
    { id: "agent_beta", name: "Beta" },
  ]) {
    await prisma.agent.create({
      data: {
        ...agent,
        harness: "automomo-daemon",
        runtimeId: "runtime_1",
        workspaceId: "workspace_1",
      },
    })
    await prisma.roomAgent.create({
      data: { roomId: "room_1", agentId: agent.id },
    })
  }

  await prisma.agentRun.create({
    data: {
      id: "lead_run",
      roomId: "room_1",
      agentId: "agent_lead",
      runtimeId: "runtime_1",
      prompt: "Lead the work",
      sourceMessageId: "human_msg",
      status: "claimed",
    },
  })
}

describe("local daemon fan-out/fan-in", () => {
  it("creates local child runs and queues exactly one lead follow-up after all children complete", withTestDatabase(async () => {
    await seedLocalTeam()

    await completeAgentRun({
      runId: "lead_run",
      roomId: "room_1",
      agentId: "agent_lead",
      messageText: "Please have @Alpha research and @Beta implement.",
      sessionUrl: null,
      userId: null,
      workspaceId: "workspace_1",
      source: "automomo-daemon",
    })
    await drainAfterTasks()

    const orchestration = await prisma.agentOrchestration.findUnique({
      where: { leadRunId: "lead_run" },
      include: { children: { orderBy: { agentId: "asc" } } },
    })
    expect(orchestration).toMatchObject({
      roomId: "room_1",
      leadAgentId: "agent_lead",
      status: "running",
      followupRunId: null,
    })
    expect(orchestration?.children).toHaveLength(2)

    const childRunIds = orchestration?.children.map((child) => child.runId) ?? []
    const childRuns = await prisma.agentRun.findMany({
      where: { id: { in: childRunIds } },
      orderBy: { agentId: "asc" },
    })
    expect(childRuns.map((run) => run.id)).toEqual(childRunIds)
    expect(childRuns.map((run) => run.status)).toEqual(["queued", "queued"])
    expect(orchestration?.children.map((child) => child.status)).toEqual(["dispatched", "dispatched"])

    const [firstChild, secondChild] = orchestration!.children

    await completeAgentRun({
      runId: firstChild.runId,
      roomId: "room_1",
      agentId: firstChild.agentId,
      messageText: "Alpha complete.",
      sessionUrl: null,
      userId: null,
      workspaceId: "workspace_1",
      source: "automomo-daemon",
    })
    await drainAfterTasks()

    const afterFirst = await prisma.agentOrchestration.findUnique({
      where: { leadRunId: "lead_run" },
      include: { children: { orderBy: { agentId: "asc" } } },
    })
    expect(afterFirst).toMatchObject({ status: "running", followupRunId: null })
    expect(afterFirst?.children.map((child) => child.status)).toEqual(["completed", "dispatched"])

    await completeAgentRun({
      runId: secondChild.runId,
      roomId: "room_1",
      agentId: secondChild.agentId,
      messageText: "Beta complete.",
      sessionUrl: null,
      userId: null,
      workspaceId: "workspace_1",
      source: "automomo-daemon",
    })
    await drainAfterTasks()

    const afterSecond = await prisma.agentOrchestration.findUnique({
      where: { leadRunId: "lead_run" },
      include: { children: { orderBy: { agentId: "asc" } } },
    })
    expect(afterSecond?.status).toBe("completed")
    expect(afterSecond?.followupRunId).toMatch(/^inv_/)
    expect(afterSecond?.children.map((child) => child.status)).toEqual(["completed", "completed"])

    const followupRun = await prisma.agentRun.findUnique({
      where: { id: afterSecond!.followupRunId! },
    })
    expect(followupRun).toMatchObject({
      id: afterSecond!.followupRunId!,
      agentId: "agent_lead",
      roomId: "room_1",
      runtimeId: "runtime_1",
      status: "queued",
      depth: 1,
      harness: "automomo-daemon",
    })

    await completeAgentRun({
      runId: secondChild.runId,
      roomId: "room_1",
      agentId: secondChild.agentId,
      messageText: "Beta complete.",
      sessionUrl: null,
      userId: null,
      workspaceId: "workspace_1",
      source: "automomo-daemon",
    })
    await drainAfterTasks()

    const afterRepeatedCompletion = await prisma.agentOrchestration.findUnique({
      where: { leadRunId: "lead_run" },
    })
    const leadRuns = await prisma.agentRun.findMany({
      where: { agentId: "agent_lead", id: { not: "lead_run" } },
    })
    expect(afterRepeatedCompletion?.followupRunId).toBe(afterSecond?.followupRunId)
    expect(leadRuns).toHaveLength(1)
  }))
})
