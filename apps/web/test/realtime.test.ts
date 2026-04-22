import { describe, expect, it, vi } from "vitest"
import { buildDaemonSignature } from "../lib/daemon-auth"
import { completeAgentRun, failAgentRun } from "../lib/agent-run-completion"
import { eventBroadcaster, type BroadcastEvent, type RunEventData } from "../lib/event-broadcaster"
import { automomoDaemonHarness } from "../lib/harnesses"
import { handleRunRealtimeEvent } from "../hooks/use-realtime"
import { prisma } from "../lib/prisma"
import { POST as registerDaemon } from "../app/api/daemon/register/route"
import { POST as claimLease } from "../app/api/daemon/lease/route"
import { withTestDatabase } from "./helpers/test-db"

let nonceCounter = 0

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://automomo.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

function signedHeaders(
  path: string,
  body: unknown,
  identity: { daemonId: string; runtimeId: string; secret: string }
) {
  const bodyText = JSON.stringify(body)
  const timestamp = "2026-04-22T00:00:00.000Z"
  const nonce = `realtime-${++nonceCounter}`
  return {
    "x-automomo-daemon-id": identity.daemonId,
    "x-automomo-runtime-id": identity.runtimeId,
    "x-automomo-timestamp": timestamp,
    "x-automomo-nonce": nonce,
    "x-automomo-signature": buildDaemonSignature({
      method: "POST",
      path,
      timestamp,
      bodyText,
      daemonId: identity.daemonId,
      runtimeId: identity.runtimeId,
      nonce,
      secret: identity.secret,
    }),
  }
}

async function registerLocalDaemon() {
  const response = await registerDaemon(
    jsonRequest("/api/daemon/register", {
      runtimeId: "runtime_1",
      name: "Local daemon",
      provider: "pi",
      environment: { workspaceRoot: "/repo" },
    })
  )
  expect(response.status).toBe(201)
  const payload = await response.json()
  return {
    daemonId: payload.daemon.id as string,
    runtimeId: "runtime_1",
    secret: payload.secret as string,
  }
}

async function claimRun(identity: { daemonId: string; runtimeId: string; secret: string }) {
  const body = { runtimeId: identity.runtimeId }
  const response = await claimLease(
    jsonRequest("/api/daemon/lease", body, signedHeaders("/api/daemon/lease", body, identity))
  )
  expect(response.status).toBe(200)
  return response.json()
}

async function seedLocalRunRoom() {
  await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
  await prisma.user.create({
    data: { id: "user_1", name: "User", email: "user@example.com", passwordHash: "hash" },
  })
  const room = await prisma.room.create({
    data: { id: "room_1", name: "Room", workspaceId: "workspace_1", userId: "user_1" },
  })
  await prisma.runtime.create({ data: { id: "runtime_1", name: "Runtime", workspaceRoot: "/repo" } })
  const agent = await prisma.agent.create({
    data: {
      id: "agent_1",
      name: "Builder",
      harness: "automomo-daemon",
      runtimeId: "runtime_1",
      workspaceId: "workspace_1",
    },
  })
  await prisma.roomAgent.create({ data: { roomId: room.id, agentId: agent.id } })
  return { room, agent }
}

function runEventStatuses(events: BroadcastEvent[]) {
  return events
    .filter((event) => event.type === "run")
    .map((event) => (event.data as RunEventData).status)
}

describe("local run realtime events", () => {
  it("refreshes room and task state when the client receives a run event", () => {
    const refreshRoom = vi.fn()
    const fetchTasks = vi.fn()

    const eventId = handleRunRealtimeEvent(
      "room_1",
      {
        data: JSON.stringify({ runId: "run_1", status: "completed" }),
        lastEventId: "42-0",
      } as MessageEvent,
      { refreshRoom, fetchTasks }
    )

    expect(eventId).toBe("42-0")
    expect(refreshRoom).toHaveBeenCalledTimes(1)
    expect(refreshRoom).toHaveBeenCalledWith("room_1")
    expect(fetchTasks).toHaveBeenCalledTimes(1)
    expect(fetchTasks).toHaveBeenCalledWith("room_1")
  })

  it("broadcasts queued, claimed, completed, and failed run updates for local daemon runs", withTestDatabase(async () => {
    const { room, agent } = await seedLocalRunRoom()
    const events: BroadcastEvent[] = []
    const unsubscribe = eventBroadcaster.subscribe(room.id, (event) => events.push(event))

    try {
      await automomoDaemonHarness.dispatch({
        invocationId: "run_queued",
        room,
        agent,
        prompt: "Build the feature",
        depth: 0,
        userId: "user_1",
        workspaceId: "workspace_1",
        callbackUrl: "http://localhost:3000/api/agent-response",
        chatHistory: "",
        taskSummary: "No tasks yet.",
        teammateInstructions: "",
        roomContext: "",
      })

      const identity = await registerLocalDaemon()
      const leasePayload = await claimRun(identity)
      expect(leasePayload.lease.run.id).toBe("run_queued")

      await completeAgentRun({
        runId: "run_queued",
        roomId: room.id,
        agentId: agent.id,
        messageText: "Done",
        sessionUrl: null,
        userId: "user_1",
        workspaceId: "workspace_1",
        source: "automomo-daemon",
      })

      await prisma.agentRun.create({
        data: {
          id: "run_failed",
          roomId: room.id,
          agentId: agent.id,
          runtimeId: "runtime_1",
          prompt: "Fail this",
          sourceMessageId: "msg_failed",
          status: "claimed",
        },
      })

      await failAgentRun({
        runId: "run_failed",
        roomId: room.id,
        agentId: agent.id,
        reason: "Runtime crashed",
        detail: "exit code 1",
        userId: "user_1",
      })

      expect(runEventStatuses(events)).toEqual(
        expect.arrayContaining(["queued", "claimed", "completed", "failed"])
      )

      const failedEvent = events
        .filter((event) => event.type === "run")
        .map((event) => event.data as RunEventData)
        .find((event) => event.runId === "run_failed")
      expect(failedEvent).toMatchObject({
        runId: "run_failed",
        roomId: room.id,
        agentId: agent.id,
        runtimeId: "runtime_1",
        harness: "automomo-daemon",
        status: "failed",
        failureReason: "Runtime crashed\nexit code 1",
      })
    } finally {
      unsubscribe()
    }
  }))
})
