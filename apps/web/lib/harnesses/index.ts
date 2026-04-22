import { automomoDaemonHarness } from "./daemon"
import { ozHarness } from "./oz"
import type { AgentHarness } from "./types"

export function selectHarness(agent: { harness: string }): AgentHarness {
  if (agent.harness === "automomo-daemon") return automomoDaemonHarness
  if (agent.harness === "oz") return ozHarness
  throw new Error(`Unsupported agent harness: ${agent.harness}`)
}

export { automomoDaemonHarness, ozHarness }
export type * from "./types"
