import { prisma } from "@/lib/prisma"
import { pollForCompletion, runAgent } from "@/lib/oz-client"
import { saveWarpArtifacts } from "@/lib/warp-artifacts"
import type { AgentHarness } from "./types"

export const ozHarness: AgentHarness = {
  name: "oz",
  async dispatch(context) {
    const environmentId = context.agent.environmentId || process.env.WARP_ENVIRONMENT_ID
    if (!environmentId) {
      throw new Error("This agent needs an environment to do its work in. Open the agent in the left panel and add an environment ID.")
    }

    console.log("[ozHarness] Calling runAgent with invocationId:", context.invocationId)
    console.log("[ozHarness] Prompt length:", context.prompt.length)
    console.log("[ozHarness] Using environment:", environmentId)

    const taskId = await runAgent({
      prompt: context.prompt,
      environmentId,
      userId: context.userId,
      workspaceId: context.workspaceId,
    })
    console.log("[ozHarness] Got taskId:", taskId)

    await prisma.agentCallback
      .upsert({
        where: { id: `warp-run:${context.invocationId}` },
        create: { id: `warp-run:${context.invocationId}`, response: taskId },
        update: { response: taskId },
      })
      .catch((err) => {
        console.warn("[ozHarness] Failed to persist warp-run mapping:", err)
      })

    const result = await pollForCompletion(taskId, {
      userId: context.userId,
      workspaceId: context.workspaceId,
    })

    if (result.artifacts && result.artifacts.length > 0) {
      await saveWarpArtifacts(result.artifacts, {
        roomId: context.room.id,
        agentId: context.agent.id,
        userId: context.userId,
      })
    }

    return {
      runId: context.invocationId,
      status: result.state === "failed" ? "failed" : "completed",
      sessionUrl: result.sessionLink ?? null,
      immediateMessage: result.statusMessage || (result.title ? `✓ ${result.title}` : "Task completed"),
    }
  },
}
