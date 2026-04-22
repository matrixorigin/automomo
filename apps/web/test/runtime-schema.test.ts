import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

async function readSchema() {
  return readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8")
}

function modelBlock(schema: string, name: string) {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))
  if (!match) throw new Error(`Missing model ${name}`)
  return match[0]
}

describe("runtime schema contract", () => {
  it("defines reusable runtime and daemon run models", async () => {
    const schema = await readSchema()
    const agentRun = modelBlock(schema, "AgentRun")

    expect(schema).toContain("model Runtime")
    expect(schema).toContain("model Daemon")
    expect(schema).toContain("model AgentRun")
    expect(schema).toContain("model AgentRunLease")
    expect(schema).toMatch(/\bruntimeId\s+String\?/)
    expect(agentRun).toMatch(/\bharness\s+String\s+@default\("automomo-daemon"\)/)
  })

  it("wires runs back to Oz rooms, agents, runtimes, and leases", async () => {
    const schema = await readSchema()
    const room = modelBlock(schema, "Room")
    const agent = modelBlock(schema, "Agent")
    const agentRun = modelBlock(schema, "AgentRun")
    const lease = modelBlock(schema, "AgentRunLease")

    expect(room).toMatch(/\bruns\s+AgentRun\[\]/)
    expect(agent).toMatch(/\bruntime\s+Runtime\?\s+@relation\(fields: \[runtimeId\]/)
    expect(agent).toMatch(/\bruns\s+AgentRun\[\]/)
    expect(agentRun).toMatch(/\broom\s+Room\s+@relation\(fields: \[roomId\]/)
    expect(agentRun).toMatch(/\bagent\s+Agent\s+@relation\(fields: \[agentId\]/)
    expect(agentRun).toMatch(/\bruntime\s+Runtime\?\s+@relation\(fields: \[runtimeId\]/)
    expect(agentRun).toMatch(/@@unique\(\[agentId, sourceMessageId\]\)/)
    expect(lease).toMatch(/\brun\s+AgentRun\s+@relation\(fields: \[runId\]/)
    expect(lease).toMatch(/\bruntime\s+Runtime\s+@relation\(fields: \[runtimeId\]/)
    expect(lease).toMatch(/\bdaemon\s+Daemon\s+@relation\(fields: \[daemonId\]/)
  })
})
