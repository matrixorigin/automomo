import { NextResponse } from "next/server"
import { AgentRunOutcomeUploadSchema } from "@automomo/protocol"
import { DaemonAuthError, requireSignedDaemonRequest } from "@/lib/daemon-auth"
import { completeAgentRun } from "@/lib/agent-run-completion"
import { DaemonLeaseError, requireActiveLease } from "@/lib/daemon-leases"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const bodyText = await request.text()
  try {
    const identity = await requireSignedDaemonRequest(request, bodyText)
    const body = AgentRunOutcomeUploadSchema.parse(JSON.parse(bodyText))
    const lease = await requireActiveLease({
      leaseId: body.leaseId,
      runtimeId: body.runtimeId,
      daemonId: identity.daemonId,
      runId: body.runId,
    })

    const room = await prisma.room.findUnique({
      where: { id: lease.run.roomId },
      select: { userId: true, workspaceId: true },
    })
    const result = await completeAgentRun({
      runId: lease.runId,
      roomId: lease.run.roomId,
      agentId: lease.run.agentId,
      messageText: body.content,
      sessionUrl: body.sessionUrl ?? null,
      userId: room?.userId ?? null,
      workspaceId: room?.workspaceId ?? undefined,
      source: "automomo-daemon",
    })

    await prisma.agentRunLease.update({
      where: { id: lease.id },
      data: { status: "completed", completedAt: new Date() },
    })

    return NextResponse.json({ success: true, message: result.message })
  } catch (error) {
    if (error instanceof DaemonAuthError || error instanceof DaemonLeaseError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[daemon/outcome] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    )
  }
}
