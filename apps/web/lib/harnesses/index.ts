import { automomoDaemonHarness } from "./daemon"
import type { AgentHarness } from "./types"

export function selectHarness(agent: { harness: string }): AgentHarness {
  if (agent.harness === "automomo-daemon") return automomoDaemonHarness
  throw new Error(`Unsupported agent harness: ${agent.harness}`)
}

export { automomoDaemonHarness }
export type * from "./types"
