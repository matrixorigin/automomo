import { NextResponse } from "next/server"
import { AgentRunEventUploadSchema } from "@automomo/protocol"
import { DaemonAuthError, requireSignedDaemonRequest } from "@/lib/daemon-auth"
import { appendRunMetadataEvent, DaemonLeaseError, requireActiveLease } from "@/lib/daemon-leases"
import { broadcastRunEvent, eventBroadcaster } from "@/lib/event-broadcaster"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const bodyText = await request.text()
  try {
    const identity = await requireSignedDaemonRequest(request, bodyText)
    const body = AgentRunEventUploadSchema.parse(JSON.parse(bodyText))
    const lease = await requireActiveLease({
      leaseId: body.leaseId,
      runtimeId: body.runtimeId,
      daemonId: identity.daemonId,
      runId: body.runId,
    })

    let metadataJson = lease.run.metadataJson
    for (const event of body.events) {
      metadataJson = appendRunMetadataEvent(metadataJson, event)
    }

    await prisma.agentRun.update({
      where: { id: body.runId },
      data: { metadataJson, status: "claimed" },
    })
    eventBroadcaster.broadcast({ type: "room", roomId: lease.run.roomId, data: null })
    broadcastRunEvent({
      runId: body.runId,
      roomId: lease.run.roomId,
      agentId: lease.run.agentId,
      runtimeId: lease.run.runtimeId,
      harness: "automomo-daemon",
      status: "claimed",
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof DaemonAuthError || error instanceof DaemonLeaseError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[daemon/events] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    )
  }
}
