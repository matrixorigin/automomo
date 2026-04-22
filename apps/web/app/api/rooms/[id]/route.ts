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
import { eventBroadcaster } from "@/lib/event-broadcaster"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await getAuthenticatedWorkspaceContext()
    const { id } = await params
    const room = await prisma.room.findUnique({
      where: { id, workspaceId },
      include: {
        agents: {
          include: { agent: { include: { runtime: true } } },
        },
        codebase: true,
      },
    })
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ ...room, agents: room.agents.map((ra) => serializeAgentForClient(ra.agent)) })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    if (error instanceof ForbiddenError) return forbiddenResponse(error.message)
    throw error
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await getAuthenticatedWorkspaceContext()
    const { id } = await params

    // Verify ownership
    const existing = await prisma.room.findUnique({ where: { id, workspaceId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await req.json()
    const { agentIds, description } = body
    const codebaseId =
      body.codebaseId === undefined
        ? undefined
        : typeof body.codebaseId === "string" && body.codebaseId.trim().length > 0
          ? body.codebaseId.trim()
          : null

    if (agentIds !== undefined) {
      if (!Array.isArray(agentIds)) {
        return NextResponse.json({ error: "agentIds must be an array" }, { status: 400 })
      }
      if (agentIds.length > 0) {
        const allowedAgentCount = await prisma.agent.count({
          where: { id: { in: agentIds }, workspaceId },
        })
        if (allowedAgentCount !== agentIds.length) {
          return NextResponse.json({ error: "One or more agents are not in this workspace" }, { status: 400 })
        }
      }
    }
    if (codebaseId !== undefined && codebaseId !== null) {
      const codebase = await prisma.codebase.findUnique({ where: { id: codebaseId, workspaceId } })
      if (!codebase) return NextResponse.json({ error: "Codebase not found" }, { status: 404 })
    }

    if (agentIds !== undefined) {
      await prisma.roomAgent.deleteMany({ where: { roomId: id } })
    }

    const room = await prisma.room.update({
      where: { id },
      data: {
        ...(description !== undefined && { description }),
        ...(codebaseId !== undefined && { codebaseId }),
        ...(agentIds !== undefined && {
          agents: {
            create: agentIds.map((agentId: string) => ({ agentId })),
          },
        }),
      },
      include: {
        agents: {
          include: { agent: { include: { runtime: true } } },
        },
        codebase: true,
      },
    })

    const roomData = {
      ...room,
      agents: room.agents.map((ra) => serializeAgentForClient(ra.agent)),
    }

    // Broadcast room update to SSE subscribers
    eventBroadcaster.broadcast({
      type: "room",
      roomId: id,
      data: roomData,
    })

    return NextResponse.json(roomData)
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    if (error instanceof ForbiddenError) return forbiddenResponse(error.message)
    throw error
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await getAuthenticatedWorkspaceContext()
    const { id } = await params
    const existing = await prisma.room.findUnique({ where: { id, workspaceId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    await prisma.room.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    if (error instanceof ForbiddenError) return forbiddenResponse(error.message)
    throw error
  }
}
