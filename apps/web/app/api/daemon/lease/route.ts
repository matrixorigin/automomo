import { NextResponse } from "next/server"
import { AgentRunLeaseResponseSchema, LeaseRequestSchema } from "@automomo/protocol"
import { DaemonAuthError, requireSignedDaemonRequest } from "@/lib/daemon-auth"
import { buildAgentRunLeaseResponse, DAEMON_LEASE_MS } from "@/lib/daemon-leases"
import { broadcastRunEvent, eventBroadcaster } from "@/lib/event-broadcaster"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const bodyText = await request.text()
  try {
    const identity = await requireSignedDaemonRequest(request, bodyText)
    const body = LeaseRequestSchema.parse(JSON.parse(bodyText))
    if (body.runtimeId !== identity.runtimeId) {
      return NextResponse.json({ error: "runtimeId mismatch" }, { status: 403 })
    }

    const leaseId = await prisma.$transaction(async (tx) => {
      const run = await tx.agentRun.findFirst({
        where: { runtimeId: identity.runtimeId, status: "queued" },
        orderBy: { createdAt: "asc" },
      })
      if (!run) return null

      const now = new Date()
      const expiresAt = new Date(now.getTime() + DAEMON_LEASE_MS)
      const updated = await tx.agentRun.updateMany({
        where: { id: run.id, status: "queued" },
        data: {
          status: "claimed",
          claimedAt: now,
          leaseExpiresAt: expiresAt,
        },
      })
      if (updated.count !== 1) return null

      const lease = await tx.agentRunLease.create({
        data: {
          runId: run.id,
          runtimeId: identity.runtimeId,
          daemonId: identity.daemonId,
          status: "active",
          expiresAt,
        },
      })

      await tx.agent.update({
        where: { id: run.agentId },
        data: { status: "running", activeRoomId: run.roomId },
      })

      return lease.id
    })

    if (!leaseId) {
      return NextResponse.json(AgentRunLeaseResponseSchema.parse({ lease: null }))
    }

    const response = await buildAgentRunLeaseResponse(leaseId)
    if (response.lease) {
      eventBroadcaster.broadcast({ type: "room", roomId: response.lease.run.roomId, data: null })
      broadcastRunEvent({
        runId: response.lease.run.id,
        roomId: response.lease.run.roomId,
        agentId: response.lease.run.agentId,
        runtimeId: response.lease.run.runtimeId,
        harness: "automomo-daemon",
        status: "claimed",
      })
    }
    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof DaemonAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[daemon/lease] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    )
  }
}
