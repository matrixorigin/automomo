import { NextResponse } from "next/server"
import { DaemonAuthError, requireSignedDaemonRequest } from "@/lib/daemon-auth"
import { serializeRuntime } from "@/lib/daemon-protocol"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const bodyText = await request.text()
  try {
    const identity = await requireSignedDaemonRequest(request, bodyText)
    const body = JSON.parse(bodyText) as {
      runtimeId?: unknown
      status?: unknown
      activeRuns?: unknown
      activeSessions?: unknown
      capacity?: unknown
      observedAt?: unknown
    }

    if (body.runtimeId !== identity.runtimeId) {
      return NextResponse.json({ error: "runtimeId mismatch" }, { status: 403 })
    }

    const activeRuns =
      typeof body.activeRuns === "number"
        ? body.activeRuns
        : typeof body.activeSessions === "number"
          ? body.activeSessions
          : 0
    const capacity = typeof body.capacity === "number" && body.capacity > 0 ? body.capacity : 1
    const status = typeof body.status === "string" ? body.status : "online"
    const observedAt =
      typeof body.observedAt === "string" && Number.isFinite(Date.parse(body.observedAt))
        ? new Date(body.observedAt)
        : new Date()

    const [runtime] = await prisma.$transaction([
      prisma.runtime.update({
        where: { id: identity.runtimeId },
        data: {
          status,
          capacity,
          activeRuns,
          lastHeartbeatAt: observedAt,
        },
      }),
      prisma.daemon.update({
        where: { id: identity.daemonId },
        data: { status: "online", lastSeenAt: observedAt },
      }),
    ])

    return NextResponse.json({ runtime: serializeRuntime(runtime) })
  } catch (error) {
    if (error instanceof DaemonAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[daemon/heartbeat] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    )
  }
}
