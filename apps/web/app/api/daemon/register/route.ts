import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { DaemonRegistrationSchema } from "@automomo/protocol"
import { hashDaemonSecret } from "@/lib/daemon-auth"
import { serializeRegistrationResponse } from "@/lib/daemon-protocol"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    const body = DaemonRegistrationSchema.parse(await request.json())
    const environmentJson = JSON.stringify(body.environment ?? {})
    const workspaceRoot =
      typeof body.environment?.workspaceRoot === "string" ? body.environment.workspaceRoot : ""
    const now = new Date()

    const runtime = await prisma.runtime.upsert({
      where: { id: body.runtimeId ?? `runtime_${body.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}` },
      create: {
        ...(body.runtimeId ? { id: body.runtimeId } : {}),
        name: body.name,
        provider: body.provider,
        kind: body.environment?.workspaceRoot ? "local" : "hosted",
        mode: "remote_daemon",
        workspaceRoot,
        environmentJson,
        command: "pi",
        status: "online",
        lastHeartbeatAt: now,
      },
      update: {
        name: body.name,
        provider: body.provider,
        kind: body.environment?.workspaceRoot ? "local" : "hosted",
        workspaceRoot,
        environmentJson,
        command: "pi",
        status: "online",
        lastHeartbeatAt: now,
      },
    })

    const secret = randomBytes(32).toString("base64url")
    const daemonData = {
      runtimeId: runtime.id,
      name: body.name,
      secretHash: hashDaemonSecret(secret),
      secretPreview: `${secret.slice(0, 6)}...${secret.slice(-4)}`,
      signatureVersion: "hmac-sha256-v1",
      status: "online",
      lastSeenAt: now,
    }

    const daemon = body.daemonId
      ? await prisma.daemon.upsert({
          where: { id: body.daemonId },
          create: { id: body.daemonId, ...daemonData },
          update: daemonData,
        })
      : await prisma.daemon.create({ data: daemonData })

    return NextResponse.json(serializeRegistrationResponse({ daemon, runtime, secret }), { status: 201 })
  } catch (error) {
    console.error("[daemon/register] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    )
  }
}
