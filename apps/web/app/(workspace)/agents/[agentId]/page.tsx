"use client"

import * as React from "react"
import { use } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, TrashIcon, CopyIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { ScrollArea } from "@/components/ui/scroll-area"
import { IconPicker } from "@/components/icon-picker"
import { useAgentStore } from "@/lib/stores"
import type { Agent, HarnessType } from "@/lib/types"

const AGENT_COLORS = [
  "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899",
  "#10B981", "#EF4444", "#06B6D4", "#F97316",
]
const DEFAULT_OPENCLOW_CONFIG = {
  pollIntervalSeconds: 30,
  maxMentionsPerPoll: 5,
  contextMessageCount: 20,
  leaseSeconds: 120,
}

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>
}) {
  const { agentId } = use(params)
  const router = useRouter()
  const { updateAgent, deleteAgent } = useAgentStore()
  const [agent, setAgent] = React.useState<Agent | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [tokenValue, setTokenValue] = React.useState("")
  const [copiedToken, setCopiedToken] = React.useState(false)
  const [copiedSkill, setCopiedSkill] = React.useState(false)
  const [generatingToken, setGeneratingToken] = React.useState(false)
  const [tokenError, setTokenError] = React.useState("")

  React.useEffect(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then(setAgent)
  }, [agentId])

  const update = (patch: Partial<Agent>) => {
    if (!agent) return
    setAgent({ ...agent, ...patch })
    setDirty(true)
  }

  const updateOpenClawField = (
    field: keyof Agent["openclawConfig"],
    value: number
  ) => {
    if (!agent) return
    update({
      openclawConfig: {
        ...(agent.openclawConfig ?? DEFAULT_OPENCLOW_CONFIG),
        [field]: value,
      },
    })
  }

  const handleGenerateToken = async () => {
    if (!agent) return
    setGeneratingToken(true)
    setTokenError("")
    try {
      let latestAgent = agent

      // If the user switched harness/settings locally but hasn't saved yet,
      // persist first so the token endpoint sees the correct harness.
      if (dirty) {
        const saved = await updateAgent(agentId, agent)
        setAgent(saved)
        setDirty(false)
        latestAgent = saved
      }

      if (latestAgent.harness !== "openclaw") {
        setTokenError("Switch harness to External, save, then generate a token.")
        return
      }
      const res = await fetch(`/api/agents/${agent.id}/token`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTokenError(
          typeof data?.error === "string"
            ? data.error
            : "Failed to generate token"
        )
        return
      }
      setTokenValue(data.token)
      setAgent((prev) =>
        prev
          ? {
              ...prev,
              hasAgentToken: true,
              agentTokenPreview: data.tokenPreview,
            }
          : prev
      )
      setCopiedToken(false)
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : "Failed to generate token")
    } finally {
      setGeneratingToken(false)
    }
  }

  const handleCopyToken = async () => {
    if (!tokenValue) return
    await navigator.clipboard.writeText(tokenValue)
    setCopiedToken(true)
    setTimeout(() => setCopiedToken(false), 1500)
  }

  const handleCopySkill = async () => {
    if (!agent || !tokenValue) return

    const baseUrl = window.location.origin
    const pollIntervalSeconds =
      agent.openclawConfig?.pollIntervalSeconds ??
      DEFAULT_OPENCLOW_CONFIG.pollIntervalSeconds

    const skill = `---
name: automomo-room-mentions
description: Poll automomo for @mentions and post agent responses back to rooms.
metadata: {"automomo":{"category":"collaboration","api_base":"${baseUrl}/api/agent/mentions"}}
---

# automomo room mentions

Use this skill to let an external assistant respond to room \`@mentions\` in automomo.

## Preconfigured values

- \`AUTOMOMO_BASE_URL=${baseUrl}\`
- \`AUTOMOMO_AGENT_ID=${agent.id}\`
- \`AUTOMOMO_AGENT_TOKEN=${tokenValue}\`

## Poll for mention work

\`\`\`bash
curl -s -X POST "$AUTOMOMO_BASE_URL/api/agent/mentions/poll" \\
  -H "Authorization: Bearer $AUTOMOMO_AGENT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d "{\\"agentId\\":\\"$AUTOMOMO_AGENT_ID\\"}"
\`\`\`

The response contains a \`mentions\` array. For each mention:

- Read \`prompt\`
- Use \`context\` for room history
- Produce one final assistant response
- Finish with exactly one terminal call per \`mentionId\`:
  - \`/respond\` on success
  - \`/release\` on failure
- If neither is called, the mention remains claimed until lease expiry.

## Send response

\`\`\`bash
curl -s -X POST "$AUTOMOMO_BASE_URL/api/agent/mentions/respond" \\
  -H "Authorization: Bearer $AUTOMOMO_AGENT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d "{\\"agentId\\":\\"$AUTOMOMO_AGENT_ID\\",\\"mentionId\\":\\"MENTION_ID\\",\\"content\\":\\"YOUR_RESPONSE\\"}"
\`\`\`

## Release mention (optional)

If the task cannot be completed now, release it back to the queue:

\`\`\`bash
curl -s -X POST "$AUTOMOMO_BASE_URL/api/agent/mentions/release" \\
  -H "Authorization: Bearer $AUTOMOMO_AGENT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d "{\\"agentId\\":\\"$AUTOMOMO_AGENT_ID\\",\\"mentionId\\":\\"MENTION_ID\\",\\"reason\\":\\"temporary failure\\"}"
\`\`\`

## Heartbeat guidance

Run this skill on a recurring interval (every ${pollIntervalSeconds} seconds is a good default for this agent).
`

    await navigator.clipboard.writeText(skill)
    setCopiedSkill(true)
    setTimeout(() => setCopiedSkill(false), 1500)
  }

  const handleSave = async () => {
    if (!agent || !dirty) return
    setSaving(true)
    try {
      const saved = await updateAgent(agentId, agent)
      setAgent(saved)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this agent?")) return
    setDeleting(true)
    try {
      await deleteAgent(agentId)
      router.push("/agents")
    } finally {
      setDeleting(false)
    }
  }

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 items-center gap-2 border-b px-4">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.push("/agents")}>
          <ArrowLeftIcon className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: agent.color }}
          />
          <h1 className="text-sm font-semibold">{agent.name}</h1>
        </div>
        <Button size="sm" disabled={!dirty || saving} onClick={handleSave}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          disabled={deleting}
          onClick={handleDelete}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </header>
      <ScrollArea className="flex-1 overflow-hidden">
        <div className="max-w-2xl mx-auto p-6">
          <FieldGroup>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="detail-name">Name</FieldLabel>
                <Input
                  id="detail-name"
                  value={agent.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel>Color</FieldLabel>
                <div className="flex gap-1.5">
                  {AGENT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`h-7 w-7 rounded-full border-2 transition-colors ${
                        agent.color === c ? "border-foreground" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => update({ color: c })}
                    />
                  ))}
                </div>
              </Field>
            </div>
            <Field>
              <FieldLabel>Icon</FieldLabel>
              <IconPicker value={agent.icon} onChange={(icon) => update({ icon })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="detail-role">Role</FieldLabel>
                <Input
                  id="detail-role"
                  value={agent.role ?? ""}
                  onChange={(e) => update({ role: e.target.value })}
                  placeholder="e.g. builder"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="detail-description">Description</FieldLabel>
                <Input
                  id="detail-description"
                  value={agent.description ?? ""}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="e.g. Implements focused code changes"
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Harness</FieldLabel>
              <div className="inline-flex rounded-md border p-1">
                <Button
                  type="button"
                  variant={agent.harness === "automomo-daemon" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => update({ harness: "automomo-daemon" as HarnessType })}
                >
                  Local
                </Button>
                <Button
                  type="button"
                  variant={agent.harness === "openclaw" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => update({ harness: "openclaw" as HarnessType })}
                >
                  External
                </Button>
              </div>
            </Field>
            {agent.harness !== "openclaw" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="detail-environment">Environment ID</FieldLabel>
                  <Input
                    id="detail-environment"
                    value={agent.defaultEnvironmentId ?? agent.environmentId ?? ""}
                    onChange={(e) => {
                      const value = e.target.value
                      update({ defaultEnvironmentId: value, environmentId: value, runtimeId: value })
                    }}
                    placeholder="e.g. environment_local"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="detail-prompt">Instructions</FieldLabel>
                  <Textarea
                    id="detail-prompt"
                    value={agent.instructions ?? agent.systemPrompt}
                    onChange={(e) => update({ instructions: e.target.value, systemPrompt: e.target.value })}
                    rows={5}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field>
                  <FieldLabel>External mention settings</FieldLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label htmlFor="detail-openclaw-poll-interval" className="text-xs text-muted-foreground">
                        Poll interval (seconds)
                      </label>
                      <p className="text-[10px] leading-tight text-muted-foreground">
                        How often the worker checks for new queued mentions.
                      </p>
                      <Input
                        id="detail-openclaw-poll-interval"
                        type="number"
                        min={5}
                        max={300}
                        value={agent.openclawConfig?.pollIntervalSeconds ?? DEFAULT_OPENCLOW_CONFIG.pollIntervalSeconds}
                        onChange={(e) => updateOpenClawField("pollIntervalSeconds", Number(e.target.value || 30))}
                        placeholder="30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="detail-openclaw-max-mentions" className="text-xs text-muted-foreground">
                        Mentions per poll
                      </label>
                      <p className="text-[10px] leading-tight text-muted-foreground">
                        Max queued mentions returned by each poll request.
                      </p>
                      <Input
                        id="detail-openclaw-max-mentions"
                        type="number"
                        min={1}
                        max={20}
                        value={agent.openclawConfig?.maxMentionsPerPoll ?? DEFAULT_OPENCLOW_CONFIG.maxMentionsPerPoll}
                        onChange={(e) => updateOpenClawField("maxMentionsPerPoll", Number(e.target.value || 5))}
                        placeholder="5"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="detail-openclaw-context-count" className="text-xs text-muted-foreground">
                        Context message count
                      </label>
                      <p className="text-[10px] leading-tight text-muted-foreground">
                        Recent room messages included with each mention payload.
                      </p>
                      <Input
                        id="detail-openclaw-context-count"
                        type="number"
                        min={5}
                        max={100}
                        value={agent.openclawConfig?.contextMessageCount ?? DEFAULT_OPENCLOW_CONFIG.contextMessageCount}
                        onChange={(e) => updateOpenClawField("contextMessageCount", Number(e.target.value || 20))}
                        placeholder="20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="detail-openclaw-lease-seconds" className="text-xs text-muted-foreground">
                        Lease duration (seconds)
                      </label>
                      <p className="text-[10px] leading-tight text-muted-foreground">
                        How long a claimed mention stays reserved before retry.
                      </p>
                      <Input
                        id="detail-openclaw-lease-seconds"
                        type="number"
                        min={30}
                        max={900}
                        value={agent.openclawConfig?.leaseSeconds ?? DEFAULT_OPENCLOW_CONFIG.leaseSeconds}
                        onChange={(e) => updateOpenClawField("leaseSeconds", Number(e.target.value || 120))}
                        placeholder="120"
                      />
                    </div>
                  </div>
                </Field>
                <Field>
                  <FieldLabel>External worker access token</FieldLabel>
                  <p className="text-xs text-muted-foreground">
                    Install this token in the external worker and call `/api/agent/mentions/poll`, `/respond`, and `/release` with `Authorization: Bearer &lt;token&gt;`.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      readOnly
                      value={tokenValue || agent.agentTokenPreview || "No token generated"}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGenerateToken}
                      disabled={generatingToken || saving}
                    >
                      {generatingToken
                        ? "Generating..."
                        : agent.hasAgentToken
                          ? "Rotate"
                          : "Generate"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCopyToken}
                      disabled={!tokenValue}
                    >
                      <CopyIcon className="h-4 w-4" />
                      {copiedToken ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCopySkill}
                      disabled={!tokenValue}
                    >
                      <CopyIcon className="h-4 w-4" />
                      {copiedSkill ? "Skill copied" : "Copy Skill"}
                    </Button>
                  </div>
                  {tokenError && (
                    <p className="text-xs text-destructive">{tokenError}</p>
                  )}
                </Field>
              </>
            )}
          </FieldGroup>
        </div>
      </ScrollArea>
    </div>
  )
}
