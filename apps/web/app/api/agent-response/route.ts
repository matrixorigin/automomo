import { NextResponse, after } from "next/server"
import { prisma } from "@/lib/prisma"
import { tryDecodeAgentCallbackPayload } from "@/lib/agent-callback"
import { getTaskStatus } from "@/lib/oz-client"
import { saveWarpArtifacts } from "@/lib/warp-artifacts"
import { completeAgentRun } from "@/lib/agent-run-completion"

// This route can fan out follow-up invocations and persist artifacts after the response is sent.
export const maxDuration = 300

function scheduleArtifactPersistence({
  taskId,
  roomId,
  agentId,
  userId,
  workspaceId,
}: {
  taskId: string
  roomId: string
  agentId: string
  userId: string | null
  workspaceId: string | undefined
}) {
  try {
    after(async () => {
      const marker = await prisma.agentCallback.findUnique({
        where: { id: `warp-run:${taskId}` },
        select: { response: true },
      })
      const warpRunId = marker?.response
      if (!warpRunId) return

      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const status = await getTaskStatus(warpRunId, userId, workspaceId)
          const artifacts = status.artifacts ?? []
          if (artifacts.length > 0) {
            await saveWarpArtifacts(artifacts, { roomId, agentId, userId })
            break
          }

          if (status.state === "completed" || status.state === "failed") break
        } catch (err) {
          console.error("[agent-response] Failed to fetch/save artifacts:", err)
        }

        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)))
      }
    })
  } catch (err) {
    console.error("[agent-response] Failed to schedule artifact persistence:", err)
  }
}

// POST - Agent sends its response here
export async function POST(request: Request) {
  try {
    const body = await request.json()
    // Accept both camelCase and snake_case field names
    const taskId = body.taskId || body.task_id
    const rawResponse = body.response || body.message

    if (!taskId || !rawResponse) {
      console.log("[agent-response] Missing fields. Body keys:", Object.keys(body))
      return NextResponse.json(
        { error: "taskId and response are required" },
        { status: 400 }
      )
    }

    const response = typeof rawResponse === "string" ? rawResponse : JSON.stringify(rawResponse)
    console.log(`[agent-response] Received response for task ${taskId}:`, response.substring(0, 100))

    const url = new URL(request.url)
    const decoded = tryDecodeAgentCallbackPayload(response)

    const roomId = url.searchParams.get("roomId") ?? decoded?.roomId ?? null
    const agentId = url.searchParams.get("agentId") ?? decoded?.agentId ?? null
    const messageText = decoded?.message ?? response

    if (roomId && agentId) {
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        select: { userId: true, workspaceId: true },
      })
      const userIdForInvocations = decoded?.userId ?? room?.userId ?? null
      const workspaceIdForInvocations = room?.workspaceId ?? undefined

      await completeAgentRun({
        runId: taskId,
        roomId,
        agentId,
        messageText,
        sessionUrl: null,
        userId: userIdForInvocations,
        workspaceId: workspaceIdForInvocations,
        source: "oz-callback",
      })

      scheduleArtifactPersistence({
        taskId,
        roomId,
        agentId,
        userId: userIdForInvocations,
        workspaceId: workspaceIdForInvocations,
      })
    } else {
      // Store in database (upsert in case of retry) so invokeAgent can poll and create the message.
      await prisma.agentCallback.upsert({
        where: { id: taskId },
        create: { id: taskId, response: messageText },
        update: { response: messageText },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[agent-response] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// GET - Poll for agent response
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get("taskId")

    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 })
    }

    const callback = await prisma.agentCallback.findUnique({
      where: { id: taskId },
    })

    if (callback) {
      // Remove after reading (one-time use)
      await prisma.agentCallback.delete({ where: { id: taskId } })
      return NextResponse.json({ response: callback.response })
    }

    return NextResponse.json({ response: null })
  } catch (error) {
    console.error("[agent-response] GET error:", error)
    return NextResponse.json({ response: null })
  }
}
