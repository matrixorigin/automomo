import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensureDefaultEnvironment, requireWorkspaceEnvironment } from "@/lib/environments"
import { serializeAgentForClient, stringifyOpenClawConfig } from "@/lib/openclaw"
import {
  getAuthenticatedWorkspaceContext,
  AuthError,
  ForbiddenError,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-helper"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId } = await getAuthenticatedWorkspaceContext()
    const { id } = await params
    const agent = await prisma.agent.findUnique({ where: { id, workspaceId }, include: { runtime: true } })
    if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(serializeAgentForClient(agent))
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
    const existing = await prisma.agent.findUnique({ where: { id, workspaceId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await request.json()
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name
    if (body.role !== undefined) data.role = body.role
    if (body.description !== undefined) data.description = body.description
    if (body.color !== undefined) data.color = body.color
    if (body.icon !== undefined) data.icon = body.icon
    if (body.repoUrl !== undefined) data.repoUrl = body.repoUrl
    const targetHarness = body.harness !== undefined ? body.harness : existing.harness
    if (body.harness !== undefined) {
      if (body.harness !== "automomo-daemon" && body.harness !== "openclaw") {
        return NextResponse.json({ error: "Unsupported agent harness" }, { status: 400 })
      }
      data.harness = body.harness
    }
    const environmentFieldPresent =
      body.defaultEnvironmentId !== undefined || body.environmentId !== undefined || body.runtimeId !== undefined
    if (environmentFieldPresent || body.harness !== undefined) {
      if (targetHarness === "automomo-daemon") {
        const selectedEnvironmentId = [
          body.defaultEnvironmentId,
          body.environmentId,
          body.runtimeId,
        ].find((value) => typeof value === "string" && value.trim().length > 0) as string | undefined
        const environment = selectedEnvironmentId
          ? await requireWorkspaceEnvironment(selectedEnvironmentId.trim(), workspaceId)
          : await ensureDefaultEnvironment(workspaceId)
        if (!environment) {
          return NextResponse.json({ error: "Environment not found" }, { status: 404 })
        }
        if (!environment.workspaceId) {
          await prisma.runtime.update({ where: { id: environment.id }, data: { workspaceId } })
        }
        data.runtimeId = environment.id
        data.environmentId = environment.id
      } else {
        data.runtimeId = null
        data.environmentId = ""
      }
    }
    if (body.instructions !== undefined) data.systemPrompt = body.instructions
    if (body.systemPrompt !== undefined) data.systemPrompt = body.systemPrompt
    if (body.openclawConfig !== undefined) data.openclawConfig = stringifyOpenClawConfig(body.openclawConfig)
    if (body.skills !== undefined) data.skills = JSON.stringify(body.skills)
    if (body.mcpServers !== undefined) data.mcpServers = JSON.stringify(body.mcpServers)
    if (body.scripts !== undefined) data.scripts = JSON.stringify(body.scripts)
    if (body.status !== undefined) data.status = body.status

    const agent = await prisma.agent.update({ where: { id }, data, include: { runtime: true } })
    return NextResponse.json(serializeAgentForClient(agent))
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
    const existing = await prisma.agent.findUnique({ where: { id, workspaceId } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    await prisma.agent.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    if (error instanceof ForbiddenError) return forbiddenResponse(error.message)
    throw error
  }
}
