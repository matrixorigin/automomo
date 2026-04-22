import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  AGENT_ARTIFACT_SELECT,
  RoomArtifactCreateSchema,
  createRoomArtifact,
  serializeArtifact,
  validateArtifactReferences,
} from "@/lib/artifacts"
import {
  getAuthenticatedWorkspaceContext,
  AuthError,
  ForbiddenError,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-helper"

type ZodValidationError = {
  issues?: Array<{ message?: string }>
}

function isZodValidationError(error: unknown): error is ZodValidationError {
  return (
    typeof error === "object" &&
    error !== null &&
    Array.isArray((error as ZodValidationError).issues)
  )
}

function validationErrorResponse(error: ZodValidationError) {
  return NextResponse.json(
    { error: error.issues?.[0]?.message ?? "Invalid artifact" },
    { status: 400 }
  )
}

export async function GET(request: Request) {
  try {
    const { workspaceId } = await getAuthenticatedWorkspaceContext()
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get("roomId")
    if (!roomId) return NextResponse.json({ error: "roomId required" }, { status: 400 })

    const room = await prisma.room.findUnique({ where: { id: roomId, workspaceId } })
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const artifacts = await prisma.artifact.findMany({
      where: { roomId },
      include: {
        agent: { select: AGENT_ARTIFACT_SELECT },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(artifacts.map(serializeArtifact))
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    if (error instanceof ForbiddenError) return forbiddenResponse(error.message)
    console.error("GET /api/artifacts error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const { userId, workspaceId } = await getAuthenticatedWorkspaceContext()
    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const parsed = RoomArtifactCreateSchema.safeParse(payload)
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const body = parsed.data

    const room = await prisma.room.findUnique({ where: { id: body.roomId, workspaceId } })
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 })

    const referenceError = await validateArtifactReferences({
      workspaceId,
      roomId: body.roomId,
      runId: body.runId,
      environmentId: body.environmentId,
      taskId: body.taskId,
      createdBy: body.createdBy,
    })
    if (referenceError) return NextResponse.json({ error: referenceError }, { status: 400 })

    const artifact = await createRoomArtifact({
      ...body,
      userId,
    })
    return NextResponse.json(artifact, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    if (error instanceof ForbiddenError) return forbiddenResponse(error.message)
    if (isZodValidationError(error)) return validationErrorResponse(error)
    console.error("POST /api/artifacts error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
