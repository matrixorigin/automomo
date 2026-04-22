import { NextResponse } from "next/server"
import { LeaseRenewRequestSchema } from "@automomo/protocol"
import { DaemonAuthError, requireSignedDaemonRequest } from "@/lib/daemon-auth"
import { DAEMON_LEASE_MS, DaemonLeaseError, requireActiveLease } from "@/lib/daemon-leases"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const bodyText = await request.text()
  try {
    const identity = await requireSignedDaemonRequest(request, bodyText)
    const body = LeaseRenewRequestSchema.parse(JSON.parse(bodyText))
    const lease = await requireActiveLease({
      leaseId: body.leaseId,
      runtimeId: body.runtimeId,
      daemonId: identity.daemonId,
    })

    const renewedAt = new Date()
    const expiresAt = new Date(renewedAt.getTime() + DAEMON_LEASE_MS)
    await prisma.$transaction([
      prisma.agentRunLease.update({
        where: { id: lease.id },
        data: { renewedAt, expiresAt },
      }),
      prisma.agentRun.update({
        where: { id: lease.runId },
        data: { leaseExpiresAt: expiresAt },
      }),
    ])

    return NextResponse.json({ leaseId: lease.id, expiresAt: expiresAt.toISOString() })
  } catch (error) {
    if (error instanceof DaemonAuthError || error instanceof DaemonLeaseError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[daemon/lease/renew] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    )
  }
}
