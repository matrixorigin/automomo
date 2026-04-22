import { NextResponse } from "next/server"
import { AgentRunOutcomeUploadSchema } from "@automomo/protocol"
import { DaemonAuthError, requireSignedDaemonRequest } from "@/lib/daemon-auth"
import { completeAgentRun } from "@/lib/agent-run-completion"
import { createRoomArtifact, validateArtifactReferences } from "@/lib/artifacts"
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
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }

    const artifactInputs = body.artifacts.map((artifactInput) => ({
      ...artifactInput,
      roomId: lease.run.roomId,
      runId: lease.runId,
      environmentId: lease.runtimeId,
      createdBy: lease.run.agentId,
      userId: room.userId ?? null,
    }))
    for (const artifactInput of artifactInputs) {
      const referenceError = await validateArtifactReferences({
        workspaceId: room.workspaceId ?? "",
        roomId: artifactInput.roomId,
        runId: artifactInput.runId,
        environmentId: artifactInput.environmentId,
        taskId: artifactInput.taskId,
        createdBy: artifactInput.createdBy,
      })
      if (referenceError) {
        throw new Error(referenceError)
      }
    }

    const result = await completeAgentRun({
      runId: lease.runId,
      roomId: lease.run.roomId,
      agentId: lease.run.agentId,
      messageText: body.content,
      sessionUrl: body.sessionUrl ?? null,
      userId: room.userId ?? null,
      workspaceId: room.workspaceId ?? undefined,
      source: "automomo-daemon",
    })

    const artifacts = []
    for (const artifactInput of artifactInputs) {
      artifacts.push(await createRoomArtifact(artifactInput))
    }

    await prisma.agentRunLease.update({
      where: { id: lease.id },
      data: { status: "completed", completedAt: new Date() },
    })

    return NextResponse.json({ success: true, message: result.message, artifacts })
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
