import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { serializeAgentForClient } from "@/lib/openclaw"
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
    const rooms = await prisma.room.findMany({
      where: { workspaceId },
      include: {
        agents: {
          include: { agent: { include: { runtime: true } } },
        },
        codebase: true,
      },
      orderBy: { createdAt: "asc" },
    })

    return NextResponse.json(
      rooms.map((r) => ({
        ...r,
        agents: r.agents.map((ra) => serializeAgentForClient(ra.agent)),
      }))
    )
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    if (error instanceof ForbiddenError) return forbiddenResponse(error.message)
    throw error
  }
}

export async function POST(request: Request) {
  try {
    const { userId, workspaceId } = await getAuthenticatedWorkspaceContext()
    const body = await request.json()
    const { name, description = "", agentIds = [] } = body
    const codebaseId =
      typeof body.codebaseId === "string" && body.codebaseId.trim().length > 0
        ? body.codebaseId.trim()
        : null

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    if (Array.isArray(agentIds) && agentIds.length > 0) {
      const allowedAgentCount = await prisma.agent.count({
        where: { id: { in: agentIds }, workspaceId },
      })
      if (allowedAgentCount !== agentIds.length) {
        return NextResponse.json({ error: "One or more agents are not in this workspace" }, { status: 400 })
      }
    }
    if (codebaseId) {
      const codebase = await prisma.codebase.findUnique({ where: { id: codebaseId, workspaceId } })
      if (!codebase) return NextResponse.json({ error: "Codebase not found" }, { status: 404 })
    }

    const room = await prisma.room.create({
      data: {
        name,
        description,
        codebaseId,
        workspaceId,
        userId,
        agents: {
          create: agentIds.map((agentId: string) => ({
            agent: { connect: { id: agentId } },
          })),
        },
      },
      include: {
        agents: {
          include: { agent: { include: { runtime: true } } },
        },
        codebase: true,
      },
    })

    return NextResponse.json({
      ...room,
      agents: room.agents.map((ra) => serializeAgentForClient(ra.agent)),
    })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    if (error instanceof ForbiddenError) return forbiddenResponse(error.message)
    console.error("POST /api/rooms error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
