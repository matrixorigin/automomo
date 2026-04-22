import { extractMentionedNames } from "@/lib/mentions"
import { prisma } from "@/lib/prisma"

type MentionableAgent = {
  id: string
  name: string
  harness: string
}

export interface MentionDispatchTargets {
  mentionedAgents: MentionableAgent[]
  /** Local automomo daemon agents backed by AgentRun leases. */
  daemonAgents: MentionableAgent[]
  openClawAgents: MentionableAgent[]
}

export async function getMentionDispatchTargets({
  roomId,
  content,
  excludeAgentId,
}: {
  roomId: string
  content: string
  excludeAgentId?: string | null
}): Promise<MentionDispatchTargets> {
  if (!content.includes("@")) {
    return { mentionedAgents: [], daemonAgents: [], openClawAgents: [] }
  }

  const roomAgents = await prisma.roomAgent.findMany({
    where: { roomId },
    include: { agent: true },
  })

  const candidates = roomAgents
    .map((ra) => ({ id: ra.agent.id, name: ra.agent.name, harness: ra.agent.harness }))
    .filter((agent) => agent.id !== excludeAgentId)

  const mentionedNames = extractMentionedNames(content, candidates.map((agent) => agent.name))
  if (mentionedNames.length === 0) {
    return { mentionedAgents: [], daemonAgents: [], openClawAgents: [] }
  }

  const mentionedSet = new Set(mentionedNames.map((name) => name.toLowerCase()))
  const mentionedAgents = candidates.filter((agent) => mentionedSet.has(agent.name.toLowerCase()))
  return {
    mentionedAgents,
    daemonAgents: mentionedAgents.filter((agent) => agent.harness === "automomo-daemon"),
    openClawAgents: mentionedAgents.filter((agent) => agent.harness === "openclaw"),
  }
}

export async function enqueueOpenClawMentions({
  openClawAgents,
  roomId,
  sourceMessageId,
  prompt,
}: {
  openClawAgents: MentionableAgent[]
  roomId: string
  sourceMessageId: string
  prompt: string
}): Promise<number> {
  let created = 0

  for (const agent of openClawAgents) {
    try {
      await prisma.agentMention.create({
        data: {
          agentId: agent.id,
          roomId,
          sourceMessageId,
          prompt,
          status: "pending",
        },
      })
      created += 1
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : null

      if (code !== "P2002") {
        throw error
      }
    }
  }

  return created
}
