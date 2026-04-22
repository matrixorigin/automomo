import { NextResponse } from "next/server"
import { AgentRunFailureUploadSchema } from "@automomo/protocol"
import { DaemonAuthError, requireSignedDaemonRequest } from "@/lib/daemon-auth"
import { failAgentRun } from "@/lib/agent-run-completion"
import { DaemonLeaseError, requireActiveLease } from "@/lib/daemon-leases"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const bodyText = await request.text()
  try {
    const identity = await requireSignedDaemonRequest(request, bodyText)
    const body = AgentRunFailureUploadSchema.parse(JSON.parse(bodyText))
    const lease = await requireActiveLease({
      leaseId: body.leaseId,
      runtimeId: body.runtimeId,
      daemonId: identity.daemonId,
      runId: body.runId,
    })

    const room = await prisma.room.findUnique({
      where: { id: lease.run.roomId },
      select: { userId: true },
    })
    const result = await failAgentRun({
      runId: lease.runId,
      roomId: lease.run.roomId,
      agentId: lease.run.agentId,
      reason: body.reason,
      detail: body.detail,
      userId: room?.userId ?? null,
    })

    await prisma.agentRunLease.update({
      where: { id: lease.id },
      data: { status: "failed", completedAt: new Date() },
    })

    return NextResponse.json({ success: true, message: result.message })
  } catch (error) {
    if (error instanceof DaemonAuthError || error instanceof DaemonLeaseError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[daemon/fail] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    )
  }
}
