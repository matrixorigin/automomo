import { prisma } from "@/lib/prisma"
import { broadcastRunEvent } from "@/lib/event-broadcaster"
import type { AgentHarness } from "./types"

export const automomoDaemonHarness: AgentHarness = {
  name: "automomo-daemon",
  async dispatch(context) {
    if (!context.agent.runtimeId) {
      throw new Error("This local agent needs a runtime before it can be queued.")
    }

    const run = await prisma.agentRun.upsert({
      where: { id: context.invocationId },
      create: {
        id: context.invocationId,
        roomId: context.room.id,
        agentId: context.agent.id,
        runtimeId: context.agent.runtimeId,
        sourceMessageId: context.invocationId,
        prompt: context.prompt,
        depth: context.depth,
        harness: "automomo-daemon",
        status: "queued",
        metadataJson: JSON.stringify({
          callbackUrl: context.callbackUrl,
          chatHistory: context.chatHistory,
          taskSummary: context.taskSummary,
          teammateInstructions: context.teammateInstructions,
          roomContext: context.roomContext,
        }),
      },
      update: {
        runtimeId: context.agent.runtimeId,
        prompt: context.prompt,
        depth: context.depth,
        harness: "automomo-daemon",
      },
    })

    broadcastRunEvent({
      runId: run.id,
      roomId: run.roomId,
      agentId: run.agentId,
      runtimeId: run.runtimeId,
      harness: "automomo-daemon",
      status: "queued",
      sessionUrl: run.sessionUrl,
    })

    return {
      runId: run.id,
      status: "queued",
      sessionUrl: null,
      immediateMessage: null,
    }
  },
}
