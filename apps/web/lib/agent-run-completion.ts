import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { broadcastRunEvent, eventBroadcaster } from "@/lib/event-broadcaster"
import { getMentionDispatchTargets, enqueueOpenClawMentions } from "@/lib/mention-dispatch"
import { invokeAgent } from "@/lib/invoke-agent"

const DEFAULT_ORCHESTRATION_TIMEOUT_MS = 15 * 60_000
const ACTIVE_RUN_STATUSES = ["queued", "claimed", "running"]

function getOrchestrationTimeoutMs() {
  const raw = process.env.ORCHESTRATION_TIMEOUT_MS
  if (!raw) return DEFAULT_ORCHESTRATION_TIMEOUT_MS
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ORCHESTRATION_TIMEOUT_MS
}

function generateInvocationId() {
  return `inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

function scheduleAfter(label: string, work: () => Promise<void>) {
  try {
    after(work)
  } catch (err) {
    console.warn(`[agent-run-completion] after() unavailable for ${label}, falling back:`, err)
    work().catch((error) => console.error(`[agent-run-completion] ${label} failed:`, error))
  }
}

export function sanitizeDelegateText(text: string) {
  return text.replaceAll("@", "＠")
}

export function trimForPrompt(text: string, maxChars: number) {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} chars]`
}

export interface CompleteAgentRunInput {
  runId: string
  roomId: string
  agentId: string
  messageText: string
  sessionUrl: string | null
  userId: string | null
  workspaceId: string | undefined
  source: "oz-callback" | "automomo-daemon"
}

export interface FailAgentRunInput {
  runId: string
  roomId: string
  agentId: string
  reason: string
  detail?: string
  sessionUrl?: string | null
  userId: string | null
}

async function markAgentIdleIfNoActiveRuns(agentId: string, roomId: string) {
  const activeRuns = await prisma.agentRun.count({
    where: { agentId, status: { in: ACTIVE_RUN_STATUSES } },
  })

  if (activeRuns === 0) {
    await prisma.agent.updateMany({
      where: { id: agentId, activeRoomId: roomId },
      data: { status: "idle", activeRoomId: null },
    })
  }
}

export async function completeAgentRun(input: CompleteAgentRunInput) {
  const room = await prisma.room.findUnique({
    where: input.workspaceId ? { id: input.roomId, workspaceId: input.workspaceId } : { id: input.roomId },
    select: { userId: true, workspaceId: true, paused: true },
  })
  if (!room) {
    throw new Error("Room not found")
  }

  const userIdForInvocations = input.userId ?? room.userId ?? null
  const workspaceIdForInvocations = input.workspaceId ?? room.workspaceId ?? undefined

  const message = await prisma.message.upsert({
    where: { id: input.runId },
    create: {
      id: input.runId,
      content: input.messageText,
      authorType: "agent",
      sessionUrl: input.sessionUrl,
      userId: userIdForInvocations,
      roomId: input.roomId,
      authorId: input.agentId,
    },
    update: {
      content: input.messageText,
      sessionUrl: input.sessionUrl,
    },
    include: {
      agent: { select: { id: true, name: true, color: true, icon: true, status: true, activeRoomId: true } },
    },
  })

  const runBeforeCompletion = await prisma.agentRun.findUnique({
    where: { id: input.runId },
    select: { runtimeId: true, harness: true },
  })
  const completedRun = await prisma.agentRun.updateMany({
    where: { id: input.runId },
    data: {
      status: "completed",
      completedAt: new Date(),
      responseMessageId: message.id,
      sessionUrl: input.sessionUrl,
      failureReason: null,
    },
  })

  await markAgentIdleIfNoActiveRuns(input.agentId, input.roomId)

  eventBroadcaster.broadcast({
    type: "message",
    roomId: input.roomId,
    data: { ...message, author: message.agent, agent: undefined },
  })
  eventBroadcaster.broadcast({ type: "room", roomId: input.roomId, data: null })
  if (completedRun.count > 0 && runBeforeCompletion?.harness === "automomo-daemon") {
    broadcastRunEvent({
      runId: input.runId,
      roomId: input.roomId,
      agentId: input.agentId,
      runtimeId: runBeforeCompletion.runtimeId,
      harness: "automomo-daemon",
      status: "completed",
      sessionUrl: input.sessionUrl,
    })
  }

  const activeChildOrchestration = await processFanIn({
    runId: input.runId,
    roomId: input.roomId,
    userId: userIdForInvocations,
    workspaceId: workspaceIdForInvocations,
  })

  await dispatchMentionedAgents({
    runId: input.runId,
    roomId: input.roomId,
    agentId: input.agentId,
    messageText: input.messageText,
    userId: userIdForInvocations,
    workspaceId: workspaceIdForInvocations,
    roomPaused: room.paused,
    activeChildOrchestration,
  })

  return {
    message: { ...message, author: message.agent, agent: undefined },
  }
}

export async function failAgentRun(input: FailAgentRunInput) {
  const content = input.detail
    ? `Error: ${input.reason}\n\n${input.detail}`
    : `Error: ${input.reason}`

  const message = await prisma.message.upsert({
    where: { id: input.runId },
    create: {
      id: input.runId,
      content,
      authorType: "agent",
      sessionUrl: input.sessionUrl ?? null,
      userId: input.userId,
      roomId: input.roomId,
      authorId: input.agentId,
    },
    update: {
      content,
      sessionUrl: input.sessionUrl ?? null,
    },
    include: {
      agent: { select: { id: true, name: true, color: true, icon: true, status: true, activeRoomId: true } },
    },
  })

  const runBeforeFailure = await prisma.agentRun.findUnique({
    where: { id: input.runId },
    select: { runtimeId: true, harness: true },
  })
  const failedRun = await prisma.agentRun.updateMany({
    where: { id: input.runId },
    data: {
      status: "failed",
      completedAt: new Date(),
      responseMessageId: message.id,
      sessionUrl: input.sessionUrl ?? null,
      failureReason: input.detail ? `${input.reason}\n${input.detail}` : input.reason,
    },
  })

  await prisma.agentOrchestrationChild.updateMany({
    where: { runId: input.runId, status: { not: "failed" } },
    data: { status: "failed", completedAt: new Date() },
  })

  await markAgentIdleIfNoActiveRuns(input.agentId, input.roomId)

  eventBroadcaster.broadcast({
    type: "message",
    roomId: input.roomId,
    data: { ...message, author: message.agent, agent: undefined },
  })
  eventBroadcaster.broadcast({ type: "room", roomId: input.roomId, data: null })
  if (failedRun.count > 0 && runBeforeFailure?.harness === "automomo-daemon") {
    broadcastRunEvent({
      runId: input.runId,
      roomId: input.roomId,
      agentId: input.agentId,
      runtimeId: runBeforeFailure.runtimeId,
      harness: "automomo-daemon",
      status: "failed",
      sessionUrl: input.sessionUrl ?? null,
      failureReason: input.detail ? `${input.reason}\n${input.detail}` : input.reason,
    })
  }

  return {
    message: { ...message, author: message.agent, agent: undefined },
  }
}

async function processFanIn({
  runId,
  roomId,
  userId,
  workspaceId,
}: {
  runId: string
  roomId: string
  userId: string | null
  workspaceId: string | undefined
}) {
  let activeChildOrchestration: { id: string; leadAgentId: string; status: string } | null = null

  try {
    const child = await prisma.agentOrchestrationChild.findUnique({
      where: { runId },
      include: {
        orchestration: {
          select: { id: true, leadAgentId: true, leadRunId: true, followupRunId: true, status: true },
        },
      },
    })
    if (!child) return activeChildOrchestration

    if (child.orchestration.status === "running") {
      activeChildOrchestration = {
        id: child.orchestration.id,
        leadAgentId: child.orchestration.leadAgentId,
        status: child.orchestration.status,
      }
    }

    await prisma.agentOrchestrationChild.updateMany({
      where: { runId, status: { not: "completed" } },
      data: { status: "completed", completedAt: new Date() },
    })

    const remaining = await prisma.agentOrchestrationChild.count({
      where: { orchestrationId: child.orchestration.id, status: { not: "completed" } },
    })

    if (
      remaining !== 0 ||
      child.orchestration.status !== "running" ||
      child.orchestration.followupRunId !== null
    ) {
      return activeChildOrchestration
    }

    const followupRunId = generateInvocationId()
    const updated = await prisma.agentOrchestration.updateMany({
      where: { id: child.orchestration.id, followupRunId: null },
      data: { followupRunId, status: "completed" },
    })

    if (updated.count !== 1) return activeChildOrchestration

    const [leadMessage, children] = await Promise.all([
      prisma.message.findUnique({
        where: { id: child.orchestration.leadRunId },
        select: { content: true },
      }),
      prisma.agentOrchestrationChild.findMany({
        where: { orchestrationId: child.orchestration.id },
        include: { agent: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ])

    const childRunIds = children.map((c) => c.runId)
    const childMessages = await prisma.message.findMany({
      where: { id: { in: childRunIds } },
      select: { id: true, content: true },
    })
    const msgById = new Map(childMessages.map((m) => [m.id, m.content] as const))

    const delegateSections = children
      .map((c) => {
        const raw = msgById.get(c.runId) ?? "(no response)"
        const safe = trimForPrompt(sanitizeDelegateText(raw), 8_000)
        return `Agent ${c.agent.name}:\n${safe}`
      })
      .join("\n\n")

    const leadOriginal = trimForPrompt(sanitizeDelegateText(leadMessage?.content ?? "(missing)"), 8_000)
    const followupPrompt = [
      "You delegated work to multiple agents. All delegate responses have arrived.",
      "",
      "Continue from the original request and produce a single consolidated response to the room.",
      "",
      "IMPORTANT: Do NOT include any @mentions in your response unless you intend to dispatch another agent.",
      "",
      "Original message:",
      leadOriginal,
      "",
      "Delegate responses:",
      delegateSections,
    ].join("\n")

    scheduleAfter("fan-in lead invocation", async () => {
      await invokeAgent({
        roomId,
        agentId: child.orchestration.leadAgentId,
        prompt: followupPrompt,
        depth: 1,
        userId,
        workspaceId,
        invocationId: followupRunId,
      })
    })
  } catch (err) {
    console.error("[agent-run-completion] Failed to process orchestration fan-in:", err)
  }

  return activeChildOrchestration
}

async function dispatchMentionedAgents({
  runId,
  roomId,
  agentId,
  messageText,
  userId,
  workspaceId,
  roomPaused,
  activeChildOrchestration,
}: {
  runId: string
  roomId: string
  agentId: string
  messageText: string
  userId: string | null
  workspaceId: string | undefined
  roomPaused: boolean
  activeChildOrchestration: { id: string; leadAgentId: string; status: string } | null
}) {
  if (roomPaused) {
    console.log("[agent-run-completion] Room is paused, skipping mention dispatch")
    return
  }

  try {
    const targets = await getMentionDispatchTargets({
      roomId,
      content: messageText,
      excludeAgentId: agentId,
    })

    if (targets.mentionedAgents.length > 0) {
      console.log("[agent-run-completion] Extracted mentions:", targets.mentionedAgents.map((agent) => agent.name))
    }

    if (targets.openClawAgents.length > 0) {
      await enqueueOpenClawMentions({
        openClawAgents: targets.openClawAgents,
        roomId,
        sourceMessageId: runId,
        prompt: messageText,
      })
    }

    const dispatchTargets = [...targets.ozAgents, ...targets.daemonAgents]
    if (dispatchTargets.length === 0) return

    let mentionedAgents = dispatchTargets
    if (activeChildOrchestration?.status === "running") {
      mentionedAgents = mentionedAgents.filter((target) => target.id !== activeChildOrchestration.leadAgentId)
    }
    if (mentionedAgents.length === 0) return

    const shouldOrchestrate = mentionedAgents.length >= 2
    const orchestration = shouldOrchestrate
      ? await prisma.agentOrchestration.upsert({
          where: { leadRunId: runId },
          create: {
            roomId,
            leadAgentId: agentId,
            leadRunId: runId,
            status: "running",
            deadlineAt: new Date(Date.now() + getOrchestrationTimeoutMs()),
          },
          update: {},
        })
      : null

    const dispatchable: Array<{ agent: (typeof mentionedAgents)[number]; invocationId: string }> = []
    for (const mentionedAgent of mentionedAgents) {
      const markerId = `dispatch:${runId}:${mentionedAgent.id}`
      const marker = await prisma.agentCallback.findUnique({
        where: { id: markerId },
        select: { response: true },
      })
      if (marker) {
        if (orchestration && marker.response?.startsWith("inv_")) {
          await prisma.agentOrchestrationChild
            .upsert({
              where: { runId: marker.response },
              create: {
                orchestrationId: orchestration.id,
                agentId: mentionedAgent.id,
                runId: marker.response,
                status: "dispatched",
              },
              update: {},
            })
            .catch(() => {})
        }
        continue
      }

      const childRunId = generateInvocationId()
      try {
        await prisma.agentCallback.create({ data: { id: markerId, response: childRunId } })
      } catch {
        continue
      }

      if (orchestration) {
        await prisma.agentOrchestrationChild
          .create({
            data: {
              orchestrationId: orchestration.id,
              agentId: mentionedAgent.id,
              runId: childRunId,
              status: "dispatched",
            },
          })
          .catch(() => {})
      }

      dispatchable.push({ agent: mentionedAgent, invocationId: childRunId })
    }

    if (dispatchable.length > 0) {
      await prisma.agent.updateMany({
        where: { id: { in: dispatchable.map((d) => d.agent.id) } },
        data: { status: "running", activeRoomId: roomId },
      })
      eventBroadcaster.broadcast({ type: "room", roomId, data: null })
    }

    for (const { agent, invocationId } of dispatchable) {
      console.log(`[agent-run-completion] Scheduling mentioned agent: ${agent.name} (${invocationId})`)
      scheduleAfter(`mentioned agent ${agent.name}`, async () => {
        await invokeAgent({
          roomId,
          agentId: agent.id,
          prompt: messageText,
          depth: 1,
          userId,
          workspaceId,
          invocationId,
        })
      })
    }
  } catch (err) {
    console.error("[agent-run-completion] Failed to dispatch mentioned agents:", err)
  }
}
