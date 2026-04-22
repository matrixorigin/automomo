import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth-helper", () => {
  class AuthError extends Error {}
  class ForbiddenError extends Error {}

  return {
    AuthError,
    ForbiddenError,
    getAuthenticatedWorkspaceContext: vi.fn(async () => ({
      userId: "user_1",
      workspaceId: "workspace_1",
      role: "OWNER",
    })),
    unauthorizedResponse: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
    forbiddenResponse: (message = "Forbidden") => Response.json({ error: message }, { status: 403 }),
  }
})

import { GET as listEnvironments, POST as createEnvironment } from "../app/api/environments/route"
import { GET as getEnvironment, PATCH as updateEnvironment } from "../app/api/environments/[id]/route"
import { GET as listRooms } from "../app/api/rooms/route"
import { prisma } from "../lib/prisma"
import { withTestDatabase } from "./helpers/test-db"

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://automomo.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function seedWorkspace() {
  await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
  await prisma.user.create({
    data: { id: "user_1", name: "User", email: "user@example.com", passwordHash: "hash" },
  })
}

describe("environment API", () => {
  it("creates and lists local pi environments", withTestDatabase(async () => {
    await seedWorkspace()

    const create = await createEnvironment(jsonRequest("/api/environments", {
      id: "environment_1",
      name: "Local automomo",
      kind: "local",
      workspaceRoot: "/repo",
    }))
    expect(create.status).toBe(201)
    const created = await create.json()
    expect(created).toMatchObject({
      id: "environment_1",
      name: "Local automomo",
      kind: "local",
      workspaceRoot: "/repo",
      command: "pi",
      status: "offline",
    })

    const list = await listEnvironments()
    expect(list.status).toBe(200)
    const environments = await list.json()
    expect(environments).toHaveLength(1)
    expect(environments[0].id).toBe("environment_1")
  }))

  it("updates an environment inside the active workspace", withTestDatabase(async () => {
    await seedWorkspace()
    await prisma.runtime.create({
      data: {
        id: "environment_1",
        name: "Local",
        provider: "pi",
        kind: "local",
        command: "pi",
        workspaceRoot: "/repo",
        workspaceId: "workspace_1",
      },
    })

    const update = await updateEnvironment(jsonRequest("/api/environments/environment_1", {
      name: "Local repo",
      workspaceRoot: "/workspace",
    }), params("environment_1"))
    expect(update.status).toBe(200)
    const payload = await update.json()
    expect(payload).toMatchObject({
      id: "environment_1",
      name: "Local repo",
      workspaceRoot: "/workspace",
    })

    const detail = await getEnvironment(new Request("http://automomo.test/api/environments/environment_1"), params("environment_1"))
    expect(detail.status).toBe(200)
  }))

  it("returns environment summaries for room agents", withTestDatabase(async () => {
    await seedWorkspace()
    await prisma.runtime.create({
      data: {
        id: "environment_1",
        name: "Local",
        provider: "pi",
        kind: "local",
        command: "pi",
        workspaceRoot: "/repo",
        workspaceId: "workspace_1",
      },
    })
    await prisma.agent.create({
      data: {
        id: "agent_1",
        name: "Builder",
        role: "builder",
        description: "Implements focused changes",
        harness: "automomo-daemon",
        runtimeId: "environment_1",
        environmentId: "environment_1",
        workspaceId: "workspace_1",
      },
    })
    await prisma.room.create({
      data: {
        id: "room_1",
        name: "Room",
        workspaceId: "workspace_1",
        userId: "user_1",
        agents: { create: [{ agentId: "agent_1" }] },
      },
    })

    const response = await listRooms()
    expect(response.status).toBe(200)
    const rooms = await response.json()
    expect(rooms[0].agents[0]).toMatchObject({
      id: "agent_1",
      role: "builder",
      defaultEnvironmentId: "environment_1",
      environment: { id: "environment_1", command: "pi" },
    })
  }))
})
