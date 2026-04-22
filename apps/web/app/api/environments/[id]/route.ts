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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await getAuthenticatedWorkspaceContext()
    const { id } = await params
    const environment = await prisma.runtime.findUnique({ where: { id, workspaceId } })
    if (!environment) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(serializeEnvironment(environment))
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    if (error instanceof ForbiddenError) return forbiddenResponse(error.message)
    throw error
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await getAuthenticatedWorkspaceContext()
    const { id } = await params
    const existing = await prisma.runtime.findUnique({ where: { id, workspaceId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await request.json()
    const data: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : ""
      if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 })
      data.name = name
    }

    if (body.kind !== undefined) {
      if (body.kind !== "local" && body.kind !== "hosted") {
        return NextResponse.json({ error: "kind must be local or hosted" }, { status: 400 })
      }
      data.kind = body.kind
      data.mode = body.kind === "hosted" ? "hosted" : "remote_daemon"
    }

    if (body.workspaceRoot !== undefined) {
      const workspaceRoot = typeof body.workspaceRoot === "string" ? body.workspaceRoot.trim() : ""
      data.workspaceRoot = workspaceRoot
      data.environmentJson = JSON.stringify({ workspaceRoot })
    }

    if (body.codebaseId !== undefined) {
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
      data.codebaseId = codebaseId
    }

    const environment = await prisma.runtime.update({
      where: { id },
      data,
    })
    return NextResponse.json(serializeEnvironment(environment))
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    if (error instanceof ForbiddenError) return forbiddenResponse(error.message)
    throw error
  }
}
