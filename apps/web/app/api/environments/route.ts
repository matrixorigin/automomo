import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { serializeEnvironment } from "@/lib/environments"
import {
  getAuthenticatedWorkspaceContext,
  AuthError,
  ForbiddenError,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-helper"

export async function GET() {
  try {
    const { workspaceId } = await getAuthenticatedWorkspaceContext()
    const environments = await prisma.runtime.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json(environments.map(serializeEnvironment))
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    if (error instanceof ForbiddenError) return forbiddenResponse(error.message)
    throw error
  }
}

export async function POST(request: Request) {
  try {
    const { workspaceId } = await getAuthenticatedWorkspaceContext()
    const body = await request.json()
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const kind = body.kind === "hosted" ? "hosted" : "local"
    const workspaceRoot =
      typeof body.workspaceRoot === "string" && body.workspaceRoot.trim().length > 0
        ? body.workspaceRoot.trim()
        : kind === "local"
          ? process.cwd()
          : ""
    const codebaseId =
      typeof body.codebaseId === "string" && body.codebaseId.trim().length > 0
        ? body.codebaseId.trim()
        : null

    if (codebaseId) {
      const codebase = await prisma.codebase.findUnique({ where: { id: codebaseId, workspaceId } })
      if (!codebase) {
        return NextResponse.json({ error: "Codebase not found" }, { status: 404 })
      }
    }

    const environmentJson = JSON.stringify({
      workspaceRoot,
    })

    const environment = await prisma.runtime.create({
      data: {
        ...(typeof body.id === "string" && body.id.trim().length > 0 ? { id: body.id.trim() } : {}),
        name,
        provider: "pi",
        kind,
        mode: kind === "hosted" ? "hosted" : "remote_daemon",
        workspaceRoot,
        command: "pi",
        environmentJson,
        status: "offline",
        workspaceId,
        codebaseId,
      },
    })

    return NextResponse.json(serializeEnvironment(environment), { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    if (error instanceof ForbiddenError) return forbiddenResponse(error.message)
    console.error("POST /api/environments error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
