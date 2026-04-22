import { AgentRunLeaseResponseSchema } from "@automomo/protocol"
import { parseJsonObject } from "@/lib/daemon-protocol"
import { prisma } from "@/lib/prisma"

export const DAEMON_LEASE_MS = 5 * 60 * 1000

export class DaemonLeaseError extends Error {
  constructor(
    message: string,
    public readonly status = 409
  ) {
    super(message)
    this.name = "DaemonLeaseError"
  }
}

export async function buildAgentRunLeaseResponse(leaseId: string) {
  const lease = await prisma.agentRunLease.findUnique({
    where: { id: leaseId },
    include: {
      run: {
        include: {
          room: true,
          agent: true,
          runtime: true,
        },
      },
    },
  })
  if (!lease?.run.runtime) {
    throw new DaemonLeaseError("lease not found", 404)
  }

  const messages = await prisma.message.findMany({
    where: { roomId: lease.run.roomId },
    include: {
      agent: { select: { name: true } },
      user: { select: { name: true } },
    },
    orderBy: { timestamp: "desc" },
    take: 20,
  })

  const payload = {
    leaseId: lease.id,
    run: {
      id: lease.run.id,
      roomId: lease.run.roomId,
      agentId: lease.run.agentId,
      runtimeId: lease.run.runtimeId ?? lease.runtimeId,
      prompt: lease.run.prompt,
      sourceMessageId: lease.run.sourceMessageId,
      depth: lease.run.depth,
    },
    room: {
      id: lease.run.room.id,
      name: lease.run.room.name,
      description: lease.run.room.description,
    },
    agent: {
      id: lease.run.agent.id,
      name: lease.run.agent.name,
      role: lease.run.agent.role,
      description: lease.run.agent.description,
      systemPrompt: lease.run.agent.systemPrompt,
      skills: parseJsonArray(lease.run.agent.skills).filter((value): value is string => typeof value === "string"),
      mcpServers: parseJsonArray(lease.run.agent.mcpServers),
    },
    runtime: {
      id: lease.run.runtime.id,
      name: lease.run.runtime.name,
      provider: lease.run.runtime.provider,
      workspaceRoot: lease.run.runtime.workspaceRoot || null,
      command: lease.run.runtime.command === "pi" ? lease.run.runtime.command : "pi",
      environment: parseJsonObject(lease.run.runtime.environmentJson),
    },
    context: messages.reverse().map((message) => ({
      id: message.id,
      authorType: message.authorType,
      authorName:
        message.authorType === "human"
          ? message.user?.name ?? "User"
          : message.agent?.name ?? "Agent",
      content: message.content,
      timestamp: message.timestamp.toISOString(),
    })),
    expiresAt: lease.expiresAt.toISOString(),
  }

  return AgentRunLeaseResponseSchema.parse({ lease: payload })
}

export async function requireActiveLease(input: {
  leaseId: string
  runtimeId: string
  daemonId: string
  runId?: string
}) {
  const lease = await prisma.agentRunLease.findUnique({
    where: { id: input.leaseId },
    include: { run: true },
  })
  if (!lease) {
    throw new DaemonLeaseError("lease not found or not owned by daemon")
  }
  if (lease.runtimeId !== input.runtimeId || lease.daemonId !== input.daemonId) {
    throw new DaemonLeaseError("lease not found or not owned by daemon")
  }
  if (input.runId && lease.runId !== input.runId) {
    throw new DaemonLeaseError("lease run mismatch")
  }
  if (lease.status !== "active") {
    throw new DaemonLeaseError("lease is not active")
  }
  if (lease.expiresAt <= new Date()) {
    throw new DaemonLeaseError("lease expired")
  }
  return lease
}

export function appendRunMetadataEvent(
  metadataJson: string,
  event: { kind: string; summary: string; detail: string; metadata: Record<string, unknown> }
) {
  const metadata = parseJsonObject(metadataJson)
  const existing = Array.isArray(metadata.events) ? metadata.events : []
  return JSON.stringify({
    ...metadata,
    events: [...existing, { ...event, observedAt: new Date().toISOString() }].slice(-50),
  })
}

function parseJsonArray(text: string | null | undefined): unknown[] {
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
