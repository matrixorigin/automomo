import { ArtifactCreateInputSchema, IdSchema, type ArtifactCreateInput } from "@automomo/protocol"
import { eventBroadcaster } from "@/lib/event-broadcaster"
import { prisma } from "@/lib/prisma"

export const ARTIFACT_TYPES = ["plan", "patch", "review", "pr", "document", "log"] as const

export const AGENT_ARTIFACT_SELECT = {
  id: true,
  name: true,
  color: true,
  icon: true,
  status: true,
  activeRoomId: true,
} as const

export const PUBLIC_AGENT_ARTIFACT_SELECT = {
  id: true,
  name: true,
  color: true,
  icon: true,
} as const

export const RoomArtifactCreateSchema = ArtifactCreateInputSchema.extend({
  roomId: IdSchema,
  createdBy: IdSchema.nullable().optional(),
  userId: IdSchema.nullable().optional(),
})

export type RoomArtifactCreateInput = ArtifactCreateInput & {
  roomId: string
  createdBy?: string | null
  userId?: string | null
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function serializeArtifact(artifact: {
  id: string
  roomId: string
  type: string
  title: string
  content: string
  url: string | null
  createdBy: string | null
  userId: string | null
  runId?: string | null
  environmentId?: string | null
  taskId?: string | null
  metadataJson?: string | null
  createdAt: Date
  updatedAt?: Date
  agent?: unknown
}) {
  return {
    id: artifact.id,
    roomId: artifact.roomId,
    type: artifact.type,
    title: artifact.title,
    content: artifact.content,
    url: artifact.url,
    createdBy: artifact.createdBy,
    userId: artifact.userId,
    runId: artifact.runId ?? null,
    environmentId: artifact.environmentId ?? null,
    taskId: artifact.taskId ?? null,
    metadata: parseJsonObject(artifact.metadataJson),
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt ?? artifact.createdAt,
    agent: artifact.agent ?? null,
  }
}

export function serializePublicArtifact(artifact: Parameters<typeof serializeArtifact>[0]) {
  const safe = serializeArtifact(artifact)
  return {
    id: safe.id,
    type: safe.type,
    title: safe.title,
    content: safe.content,
    url: safe.url,
    createdAt: safe.createdAt,
    agent: safe.agent,
  }
}

export async function createRoomArtifact(input: RoomArtifactCreateInput) {
  const data = RoomArtifactCreateSchema.parse(input)
  const artifact = await prisma.artifact.create({
    data: {
      roomId: data.roomId,
      type: data.type,
      title: data.title,
      content: data.content,
      url: data.url ?? null,
      createdBy: data.createdBy ?? null,
      userId: data.userId ?? null,
      runId: data.runId ?? null,
      environmentId: data.environmentId ?? null,
      taskId: data.taskId ?? null,
      metadataJson: JSON.stringify(data.metadata),
    },
    include: {
      agent: { select: AGENT_ARTIFACT_SELECT },
    },
  })
  const serialized = serializeArtifact(artifact)
  eventBroadcaster.broadcast({
    type: "artifact",
    roomId: data.roomId,
    data: serialized,
  })
  return serialized
}

export async function validateArtifactReferences(input: {
  workspaceId: string
  roomId: string
  runId?: string | null
  environmentId?: string | null
  taskId?: string | null
  createdBy?: string | null
}) {
  if (input.runId) {
    const run = await prisma.agentRun.findFirst({
      where: { id: input.runId, roomId: input.roomId },
      select: { id: true },
    })
    if (!run) return "runId does not belong to this room"
  }

  if (input.environmentId) {
    const environment = await prisma.runtime.findFirst({
      where: {
        id: input.environmentId,
        OR: [{ workspaceId: input.workspaceId }, { workspaceId: null }],
      },
      select: { id: true },
    })
    if (!environment) return "environmentId does not belong to this workspace"
  }

  if (input.taskId) {
    const task = await prisma.task.findFirst({
      where: { id: input.taskId, roomId: input.roomId },
      select: { id: true },
    })
    if (!task) return "taskId does not belong to this room"
  }

  if (input.createdBy) {
    const agent = await prisma.agent.findFirst({
      where: {
        id: input.createdBy,
        OR: [{ workspaceId: input.workspaceId }, { workspaceId: null }],
      },
      select: { id: true },
    })
    if (!agent) return "createdBy agent does not belong to this workspace"
  }

  return null
}
