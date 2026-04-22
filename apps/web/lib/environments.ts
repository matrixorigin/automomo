import { EnvironmentSchema } from "@automomo/protocol"
import type { Runtime } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

export const DEFAULT_ENVIRONMENT_ID = "environment_local"
export const DEFAULT_ENVIRONMENT_COMMAND = "pi"

export function serializeEnvironment(runtime: Runtime) {
  return EnvironmentSchema.parse({
    id: runtime.id,
    workspaceId: runtime.workspaceId ?? undefined,
    codebaseId: runtime.codebaseId ?? undefined,
    name: runtime.name,
    kind: runtime.kind === "hosted" ? "hosted" : "local",
    workspaceRoot: runtime.workspaceRoot || undefined,
    command: runtime.command === DEFAULT_ENVIRONMENT_COMMAND ? runtime.command : DEFAULT_ENVIRONMENT_COMMAND,
    status: normalizeEnvironmentStatus(runtime.status),
    capacity: runtime.capacity,
    activeRuns: runtime.activeRuns,
    lastHeartbeatAt: runtime.lastHeartbeatAt?.toISOString(),
    createdAt: runtime.createdAt.toISOString(),
    updatedAt: runtime.updatedAt.toISOString(),
  })
}

export function serializeEnvironmentSummary(runtime: Runtime | null | undefined) {
  return runtime ? serializeEnvironment(runtime) : null
}

export async function ensureDefaultEnvironment(workspaceId: string) {
  const existing = await prisma.runtime.findUnique({ where: { id: DEFAULT_ENVIRONMENT_ID } })
  const environmentId =
    existing?.workspaceId && existing.workspaceId !== workspaceId
      ? `${DEFAULT_ENVIRONMENT_ID}_${workspaceId}`
      : DEFAULT_ENVIRONMENT_ID

  return prisma.runtime.upsert({
    where: { id: environmentId },
    update: {
      workspaceId,
      provider: "pi",
      kind: "local",
      mode: "remote_daemon",
      command: DEFAULT_ENVIRONMENT_COMMAND,
    },
    create: {
      id: environmentId,
      name: "Local environment",
      provider: "pi",
      kind: "local",
      mode: "remote_daemon",
      workspaceRoot: process.cwd(),
      environmentJson: JSON.stringify({ workspaceRoot: process.cwd() }),
      command: DEFAULT_ENVIRONMENT_COMMAND,
      status: "offline",
      workspaceId,
    },
  })
}

export async function requireWorkspaceEnvironment(environmentId: string, workspaceId: string) {
  const environment = await prisma.runtime.findUnique({ where: { id: environmentId } })
  if (!environment) return null
  if (environment.workspaceId && environment.workspaceId !== workspaceId) return null
  return environment
}

export function environmentJsonWithWorkspaceRoot(runtime: Runtime) {
  return {
    ...parseJsonObject(runtime.environmentJson),
    ...(runtime.workspaceRoot ? { workspaceRoot: runtime.workspaceRoot } : {}),
  }
}

function normalizeEnvironmentStatus(status: string) {
  return status === "online" || status === "busy" || status === "unhealthy"
    ? status
    : "offline"
}

function parseJsonObject(text: string | null | undefined): Record<string, unknown> {
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}
