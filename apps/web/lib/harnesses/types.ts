import type { Agent, Room } from "@/lib/generated/prisma/client"

export type AgentHarnessName = "automomo-daemon"

export interface AgentRunContext {
  invocationId: string
  room: Room
  agent: Agent
  prompt: string
  depth: number
  userId: string | null
  workspaceId: string
  callbackUrl: string
  chatHistory: string
  taskSummary: string
  teammateInstructions: string
  roomContext: string
}

export interface AgentDispatchResult {
  runId: string
  status: "queued" | "running" | "completed" | "failed"
  sessionUrl: string | null
  immediateMessage: string | null
}

export interface AgentHarness {
  name: AgentHarnessName
  dispatch(context: AgentRunContext): Promise<AgentDispatchResult>
}
