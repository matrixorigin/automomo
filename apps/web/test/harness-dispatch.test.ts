import { describe, expect, it, vi } from "vitest"
import { automomoDaemonHarness, ozHarness, selectHarness } from "../lib/harnesses"
import { prisma } from "../lib/prisma"
import { withTestDatabase } from "./helpers/test-db"

vi.mock("@/lib/oz-client", () => ({
  runAgent: vi.fn(async () => "warp_run_1"),
  pollForCompletion: vi.fn(async () => ({
    taskId: "warp_run_1",
    state: "completed",
    title: "Built it",
    sessionLink: "https://warp.test/session/1",
    statusMessage: "Done from Oz",
    artifacts: [],
  })),
}))

vi.mock("@/lib/warp-artifacts", () => ({
  saveWarpArtifacts: vi.fn(async () => undefined),
}))

describe("selectHarness", () => {
  it("uses the automomo daemon harness for local runtime agents", () => {
    const harness = selectHarness({ harness: "automomo-daemon" })
    expect(harness.name).toBe("automomo-daemon")
  })

  it("keeps the Oz harness for legacy Oz agents", () => {
    const harness = selectHarness({ harness: "oz" })
    expect(harness.name).toBe("oz")
  })

  it("rejects unsupported harnesses with the harness name in the error", () => {
    expect(() => selectHarness({ harness: "claude-code" })).toThrow("Unsupported agent harness: claude-code")
  })

  it("queues an AgentRun for automomo daemon agents", withTestDatabase(async () => {
    await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
    const room = await prisma.room.create({
      data: { id: "room_1", name: "Room", workspaceId: "workspace_1" },
    })
    await prisma.runtime.create({
      data: { id: "runtime_1", name: "Runtime", workspaceRoot: "/repo" },
    })
    const agent = await prisma.agent.create({
      data: {
        id: "agent_1",
        name: "Builder",
        harness: "automomo-daemon",
        runtimeId: "runtime_1",
        workspaceId: "workspace_1",
      },
    })

    const result = await automomoDaemonHarness.dispatch({
      invocationId: "run_1",
      room,
      agent,
      prompt: "Build the feature",
      depth: 0,
      userId: null,
      workspaceId: "workspace_1",
      callbackUrl: "http://localhost:3000/api/agent-response",
      chatHistory: "",
      taskSummary: "No tasks yet.",
      teammateInstructions: "",
      roomContext: "",
    })

    const run = await prisma.agentRun.findUnique({ where: { id: "run_1" } })
    expect(result).toMatchObject({ runId: "run_1", status: "queued", immediateMessage: null })
    expect(run).toMatchObject({
      id: "run_1",
      roomId: "room_1",
      agentId: "agent_1",
      runtimeId: "runtime_1",
      prompt: "Build the feature",
      status: "queued",
      harness: "automomo-daemon",
    })
  }))

  it("dispatches Oz agents through the existing Oz client path", withTestDatabase(async () => {
    await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
    const room = await prisma.room.create({
      data: { id: "room_1", name: "Room", workspaceId: "workspace_1" },
    })
    const agent = await prisma.agent.create({
      data: {
        id: "agent_1",
        name: "Builder",
        harness: "oz",
        environmentId: "env_1",
        workspaceId: "workspace_1",
      },
    })

    const result = await ozHarness.dispatch({
      invocationId: "inv_1",
      room,
      agent,
      prompt: "Build the feature",
      depth: 0,
      userId: null,
      workspaceId: "workspace_1",
      callbackUrl: "http://localhost:3000/api/agent-response",
      chatHistory: "",
      taskSummary: "No tasks yet.",
      teammateInstructions: "",
      roomContext: "",
    })

    const marker = await prisma.agentCallback.findUnique({ where: { id: "warp-run:inv_1" } })
    expect(result).toMatchObject({
      runId: "inv_1",
      status: "completed",
      sessionUrl: "https://warp.test/session/1",
      immediateMessage: "Done from Oz",
    })
    expect(marker?.response).toBe("warp_run_1")
  }))
})
