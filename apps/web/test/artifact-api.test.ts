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

import { GET as listArtifacts, POST as createArtifact } from "../app/api/artifacts/route"
import { GET as listPublicArtifacts } from "../app/api/public/artifacts/route"
import { prisma } from "../lib/prisma"
import { withTestDatabase } from "./helpers/test-db"

function request(path: string, body: unknown) {
  return new Request(`http://automomo.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function seedWorkspace() {
  await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
  await prisma.workspace.create({ data: { id: "workspace_2", name: "Other Workspace" } })
  await prisma.user.create({
    data: { id: "user_1", name: "User", email: "user@example.com", passwordHash: "hash" },
  })
  await prisma.room.create({
    data: {
      id: "room_1",
      name: "Room",
      workspaceId: "workspace_1",
      userId: "user_1",
      publicShareId: "share_1",
      publicShareEnabledAt: new Date("2026-04-22T00:00:00.000Z"),
    },
  })
  await prisma.room.create({
    data: { id: "room_other", name: "Other Room", workspaceId: "workspace_2" },
  })
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
      harness: "automomo-daemon",
      runtimeId: "environment_1",
      workspaceId: "workspace_1",
    },
  })
  await prisma.task.create({
    data: {
      id: "task_1",
      roomId: "room_1",
      title: "Build feature",
      userId: "user_1",
    },
  })
  await prisma.agentRun.create({
    data: {
      id: "run_1",
      roomId: "room_1",
      agentId: "agent_1",
      runtimeId: "environment_1",
      prompt: "Build it",
    },
  })
}

describe("artifact API", () => {
  it("validates, creates, and lists automomo artifact metadata with agent summaries", withTestDatabase(async () => {
    await seedWorkspace()

    const response = await createArtifact(request("/api/artifacts", {
      roomId: "room_1",
      type: "patch",
      title: "Current working diff",
      content: "diff --git a/package.json b/package.json",
      createdBy: "agent_1",
      runId: "run_1",
      environmentId: "environment_1",
      taskId: "task_1",
      metadata: { command: "git diff", filesChanged: ["package.json"] },
    }))

    expect(response.status).toBe(201)
    const created = await response.json()
    expect(created).toMatchObject({
      roomId: "room_1",
      type: "patch",
      title: "Current working diff",
      createdBy: "agent_1",
      runId: "run_1",
      environmentId: "environment_1",
      taskId: "task_1",
      metadata: { command: "git diff", filesChanged: ["package.json"] },
      agent: { id: "agent_1", name: "Builder" },
    })

    const list = await listArtifacts(new Request("http://automomo.test/api/artifacts?roomId=room_1"))
    expect(list.status).toBe(200)
    const artifacts = await list.json()
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({ type: "patch", agent: { id: "agent_1" } })
  }))

  it("rejects invalid artifact types and rooms outside the active workspace", withTestDatabase(async () => {
    await seedWorkspace()

    const invalidType = await createArtifact(request("/api/artifacts", {
      roomId: "room_1",
      type: "sheet",
      title: "Legacy sheet",
    }))
    expect(invalidType.status).toBe(400)

    const otherRoom = await createArtifact(request("/api/artifacts", {
      roomId: "room_other",
      type: "plan",
      title: "Hidden plan",
    }))
    expect(otherRoom.status).toBe(404)
  }))

  it("exposes public artifacts without private metadata", withTestDatabase(async () => {
    await seedWorkspace()
    await prisma.artifact.create({
      data: {
        id: "artifact_1",
        roomId: "room_1",
        type: "review",
        title: "Review artifact",
        content: "Looks good.",
        createdBy: "agent_1",
        userId: "user_1",
        runId: "run_1",
        environmentId: "environment_1",
        taskId: "task_1",
        metadataJson: JSON.stringify({ privateNotes: "do not leak" }),
      },
    })

    const response = await listPublicArtifacts(
      new Request("http://automomo.test/api/public/artifacts?shareId=share_1")
    )
    expect(response.status).toBe(200)
    const artifacts = await response.json()
    expect(artifacts[0]).toMatchObject({
      id: "artifact_1",
      type: "review",
      title: "Review artifact",
      agent: { id: "agent_1", name: "Builder" },
    })
    expect(artifacts[0]).not.toHaveProperty("metadata")
    expect(artifacts[0]).not.toHaveProperty("metadataJson")
    expect(artifacts[0]).not.toHaveProperty("environmentId")
    expect(artifacts[0]).not.toHaveProperty("runId")
    expect(artifacts[0]).not.toHaveProperty("taskId")
  }))
})
