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

export async function GET() {
  try {
    const { workspaceId } = await getAuthenticatedWorkspaceContext()
    const agents = await prisma.agent.findMany({
      where: { workspaceId },
      include: { runtime: true },
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json(agents.map((a) => serializeAgentForClient(a)))
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
    const harness = typeof body.harness === "string" ? body.harness : "automomo-daemon"
    if (harness !== "automomo-daemon" && harness !== "openclaw") {
      return NextResponse.json({ error: "Unsupported agent harness" }, { status: 400 })
    }
    const selectedEnvironmentId = [
      body.defaultEnvironmentId,
      body.environmentId,
      body.runtimeId,
      body.selectedRuntimeId,
    ].find((value) => typeof value === "string" && value.trim().length > 0) as string | undefined
    let runtimeId: string | null = null
    if (harness === "automomo-daemon") {
      const environment = selectedEnvironmentId
        ? await requireWorkspaceEnvironment(selectedEnvironmentId.trim(), workspaceId)
        : await ensureDefaultEnvironment(workspaceId)
      if (!environment) {
        return NextResponse.json({ error: "Environment not found" }, { status: 404 })
      }
      if (!environment.workspaceId) {
        await prisma.runtime.update({ where: { id: environment.id }, data: { workspaceId } })
      }
      runtimeId = environment.id
    }
    const agent = await prisma.agent.create({
      data: {
        name: body.name,
        role: typeof body.role === "string" ? body.role : "",
        description: typeof body.description === "string" ? body.description : "",
        color: body.color ?? "#3B82F6",
        icon: body.icon ?? "robot",
        repoUrl: body.repoUrl ?? "",
        harness,
        environmentId: runtimeId ?? "",
        runtimeId,
        systemPrompt: body.instructions ?? body.systemPrompt ?? "",
        openclawConfig: stringifyOpenClawConfig(body.openclawConfig),
        skills: JSON.stringify(body.skills ?? []),
        mcpServers: JSON.stringify(body.mcpServers ?? []),
        scripts: JSON.stringify(body.scripts ?? []),
        workspaceId,
        userId,
      },
    })
    const agentWithEnvironment = await prisma.agent.findUnique({
      where: { id: agent.id },
      include: { runtime: true },
    })
    return NextResponse.json(serializeAgentForClient(agentWithEnvironment ?? agent))
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    if (error instanceof ForbiddenError) return forbiddenResponse(error.message)
    console.error("POST /api/agents error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
