import { describe, expect, it } from "vitest"
import { completeAgentRun, sanitizeDelegateText, trimForPrompt } from "../lib/agent-run-completion"
import { prisma } from "../lib/prisma"
import { withTestDatabase } from "./helpers/test-db"

describe("agent run completion helpers", () => {
  it("sanitizes delegate mentions before fan-in prompt construction", () => {
    expect(sanitizeDelegateText("Ask @Builder and @Reviewer")).toBe("Ask ＠Builder and ＠Reviewer")
  })

  it("trims long delegate text with a byte-count style suffix", () => {
    expect(trimForPrompt("abcdef", 3)).toBe("abc\n\n[truncated 3 chars]")
  })

  it("creates one room message and marks the daemon run completed", withTestDatabase(async () => {
    await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
    await prisma.user.create({
      data: { id: "user_1", name: "User", email: "user@example.com", passwordHash: "hash" },
    })
    await prisma.room.create({
      data: { id: "room_1", name: "Room", workspaceId: "workspace_1", userId: "user_1" },
    })
    await prisma.runtime.create({ data: { id: "runtime_1", name: "Runtime", workspaceRoot: "/repo" } })
    await prisma.agent.create({
      data: {
        id: "agent_1",
        name: "Builder",
        harness: "automomo-daemon",
        runtimeId: "runtime_1",
        workspaceId: "workspace_1",
        status: "running",
        activeRoomId: "room_1",
      },
    })
    await prisma.agentRun.create({
      data: {
        id: "run_1",
        roomId: "room_1",
        agentId: "agent_1",
        runtimeId: "runtime_1",
        prompt: "Build it",
        sourceMessageId: "msg_1",
        status: "claimed",
      },
    })

    const result = await completeAgentRun({
      runId: "run_1",
      roomId: "room_1",
      agentId: "agent_1",
      messageText: "Done",
      sessionUrl: null,
      userId: null,
      workspaceId: "workspace_1",
      source: "automomo-daemon",
    })

    const [message, run, agent] = await Promise.all([
      prisma.message.findUnique({ where: { id: "run_1" } }),
      prisma.agentRun.findUnique({ where: { id: "run_1" } }),
      prisma.agent.findUnique({ where: { id: "agent_1" } }),
    ])
    expect(result.message.content).toBe("Done")
    expect(message?.authorId).toBe("agent_1")
    expect(run).toMatchObject({ status: "completed", responseMessageId: "run_1" })
    expect(agent).toMatchObject({ status: "idle", activeRoomId: null })
  }))
})
