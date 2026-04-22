import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { PUBLIC_AGENT_ARTIFACT_SELECT, serializePublicArtifact } from "@/lib/artifacts"
import { getSharedRoomByPublicShareId } from "@/lib/public-share"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const shareId = searchParams.get("shareId")
  if (!shareId) return NextResponse.json({ error: "shareId required" }, { status: 400 })

  const room = await getSharedRoomByPublicShareId(shareId)
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const artifacts = await prisma.artifact.findMany({
    where: { roomId: room.id },
    include: {
      agent: { select: PUBLIC_AGENT_ARTIFACT_SELECT },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(artifacts.map(serializePublicArtifact))
}
