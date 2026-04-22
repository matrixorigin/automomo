import {
  DaemonRegistrationResponseSchema,
  DaemonSchema,
  RuntimeSchema,
} from "@automomo/protocol"
import type { Daemon, Runtime } from "@/lib/generated/prisma/client"

export function parseJsonObject(text: string | null | undefined): Record<string, unknown> {
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

export function serializeRuntime(runtime: Runtime) {
  return RuntimeSchema.parse({
    id: runtime.id,
    name: runtime.name,
    mode: runtime.mode,
    provider: runtime.provider,
    environment: parseJsonObject(runtime.environmentJson),
    status: runtime.status,
    capacity: runtime.capacity,
    activeSessions: runtime.activeRuns,
    lastHeartbeatAt: runtime.lastHeartbeatAt?.toISOString(),
    metadata: {},
    createdAt: runtime.createdAt.toISOString(),
    updatedAt: runtime.updatedAt.toISOString(),
  })
}

export function serializeDaemon(daemon: Daemon) {
  return DaemonSchema.parse({
    id: daemon.id,
    runtimeId: daemon.runtimeId,
    name: daemon.name,
    secretId: daemon.secretPreview,
    signatureVersion: daemon.signatureVersion,
    status: daemon.status,
    lastSeenAt: daemon.lastSeenAt?.toISOString(),
    metadata: {},
    createdAt: daemon.createdAt.toISOString(),
    updatedAt: daemon.updatedAt.toISOString(),
  })
}

export function serializeRegistrationResponse(input: {
  daemon: Daemon
  runtime: Runtime
  secret: string
}) {
  return DaemonRegistrationResponseSchema.parse({
    daemon: serializeDaemon(input.daemon),
    runtime: serializeRuntime(input.runtime),
    secret: input.secret,
  })
}
