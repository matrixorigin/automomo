import { describe, expect, it } from "vitest"
import { POST as respondToMention } from "../app/api/agent/mentions/respond/route"
import { hashAgentAccessToken } from "../lib/openclaw"
import { prisma } from "../lib/prisma"
import { withTestDatabase } from "./helpers/test-db"

const token = "ocw_test_token"

function responseRequest(body: unknown) {
  return new Request("http://automomo.test/api/agent/mentions/respond", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

async function seedClaimedMention() {
  await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
  await prisma.user.create({
    data: { id: "user_1", name: "User", email: "user@example.com", passwordHash: "hash" },
  })
  await prisma.room.create({
    data: { id: "room_1", name: "Room", workspaceId: "workspace_1", userId: "user_1" },
  })
  await prisma.agent.create({
    data: {
      id: "agent_1",
      name: "External Reviewer",
      harness: "openclaw",
      workspaceId: "workspace_1",
      agentTokenHash: hashAgentAccessToken(token),
      status: "running",
      activeRoomId: "room_1",
    },
  })
  await prisma.task.create({
    data: {
      id: "task_1",
      roomId: "room_1",
      title: "Review patch",
      userId: "user_1",
    },
  })
  await prisma.agentMention.create({
    data: {
      id: "mention_1",
      agentId: "agent_1",
      roomId: "room_1",
      sourceMessageId: "message_1",
      prompt: "Review this",
      status: "claimed",
      claimedAt: new Date("2026-04-22T00:00:00.000Z"),
      leaseExpiresAt: new Date("2099-04-22T00:00:00.000Z"),
    },
  })
}

describe("agent mention artifact responses", () => {
  it("stores artifacts from external mention agents with the room response", withTestDatabase(async () => {
    await seedClaimedMention()

    const response = await respondToMention(responseRequest({
      agentId: "agent_1",
      mentionId: "mention_1",
      content: "Review complete.",
      artifacts: [
        {
          type: "review",
          title: "Patch review",
          content: "No blocking issues.",
          taskId: "task_1",
          metadata: { checks: ["typecheck"] },
        },
      ],
    }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.artifacts[0]).toMatchObject({
      roomId: "room_1",
      type: "review",
      title: "Patch review",
      createdBy: "agent_1",
      userId: "user_1",
      taskId: "task_1",
      metadata: { checks: ["typecheck"] },
    })

    const [message, mention, artifact] = await Promise.all([
      prisma.message.findUnique({ where: { id: "ocm_mention_1" } }),
      prisma.agentMention.findUnique({ where: { id: "mention_1" } }),
      prisma.artifact.findFirst({ where: { roomId: "room_1" } }),
    ])
    expect(message).toMatchObject({ content: "Review complete.", authorId: "agent_1" })
    expect(mention).toMatchObject({ status: "completed", responseMessageId: "ocm_mention_1" })
    expect(artifact).toMatchObject({
      type: "review",
      createdBy: "agent_1",
      userId: "user_1",
      taskId: "task_1",
    })
  }))

  it("rejects invalid mention artifacts without completing the mention", withTestDatabase(async () => {
    await seedClaimedMention()

    const response = await respondToMention(responseRequest({
      agentId: "agent_1",
      mentionId: "mention_1",
      content: "Review complete.",
      artifacts: [{ type: "sheet", title: "Legacy sheet" }],
    }))

    expect(response.status).toBe(400)
    const [mention, messageCount, artifactCount] = await Promise.all([
      prisma.agentMention.findUnique({ where: { id: "mention_1" } }),
      prisma.message.count(),
      prisma.artifact.count(),
    ])
    expect(mention).toMatchObject({ status: "claimed", responseMessageId: null })
    expect(messageCount).toBe(0)
    expect(artifactCount).toBe(0)
  }))
})
