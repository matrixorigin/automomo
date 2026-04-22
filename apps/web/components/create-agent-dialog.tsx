"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { IconPicker } from "@/components/icon-picker"
import { useAgentStore } from "@/lib/stores"
import type { HarnessType } from "@/lib/types"

const AGENT_COLORS = [
  "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899",
  "#10B981", "#EF4444", "#06B6D4", "#F97316",
]

export function CreateAgentDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { createAgent } = useAgentStore()
  const [name, setName] = React.useState("")
  const [role, setRole] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [environmentId, setEnvironmentId] = React.useState("")
  const [instructions, setInstructions] = React.useState("")
  const [harness, setHarness] = React.useState<HarnessType>("automomo-daemon")
  const [openclawConfig, setOpenclawConfig] = React.useState({
    pollIntervalSeconds: 30,
    maxMentionsPerPoll: 5,
    contextMessageCount: 20,
    leaseSeconds: 120,
  })
  const [color, setColor] = React.useState(AGENT_COLORS[0])
  const [icon, setIcon] = React.useState("robot")
  const [loading, setLoading] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await createAgent({
        name: name.trim(),
        role: role.trim(),
        description: description.trim(),
        environmentId: harness === "automomo-daemon" ? environmentId.trim() || undefined : "",
        defaultEnvironmentId: harness === "automomo-daemon" ? environmentId.trim() || undefined : undefined,
        runtimeId: harness === "automomo-daemon" ? environmentId.trim() || undefined : null,
        harness,
        instructions: harness === "openclaw" ? "" : instructions.trim(),
        systemPrompt: harness === "openclaw" ? "" : instructions.trim(),
        openclawConfig,
        color,
        icon,
      })
      onOpenChange(false)
      setName("")
      setRole("")
      setDescription("")
      setEnvironmentId("")
      setInstructions("")
      setHarness("automomo-daemon")
      setOpenclawConfig({
        pollIntervalSeconds: 30,
        maxMentionsPerPoll: 5,
        contextMessageCount: 20,
        leaseSeconds: 120,
      })
      setColor(AGENT_COLORS[0])
      setIcon("robot")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Agent</DialogTitle>
          <DialogDescription>
            Create an automomo local agent, or connect an external mention-polling agent.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="agent-name">Name</FieldLabel>
                <Input
                  id="agent-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. backend-lead"
                  required
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
                        color === c ? "border-foreground" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="agent-role">Role</FieldLabel>
                <Input
                  id="agent-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. builder"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-description">Description</FieldLabel>
                <Input
                  id="agent-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Implements focused code changes"
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Icon</FieldLabel>
              <IconPicker value={icon} onChange={setIcon} />
            </Field>
            <Field>
              <FieldLabel>Harness</FieldLabel>
              <div className="inline-flex rounded-md border p-1">
                <Button
                  type="button"
                  variant={harness === "automomo-daemon" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setHarness("automomo-daemon")}
                >
                  Local
                </Button>
                <Button
                  type="button"
                  variant={harness === "openclaw" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setHarness("openclaw")}
                >
                  External
                </Button>
              </div>
            </Field>
            {harness === "automomo-daemon" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="agent-environment">Environment ID</FieldLabel>
                  <Input
                    id="agent-environment"
                    value={environmentId}
                    onChange={(e) => setEnvironmentId(e.target.value)}
                    placeholder="e.g. environment_local"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="agent-prompt">Instructions</FieldLabel>
                  <Textarea
                    id="agent-prompt"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="You are a backend engineering agent..."
                    rows={3}
                  />
                </Field>
              </>
            ) : (
              <Field>
                <FieldLabel>External mention settings</FieldLabel>
                <p className="text-xs text-muted-foreground">
                  After creation, open this agent and generate an access token for the external worker.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label htmlFor="openclaw-poll-interval" className="text-xs text-muted-foreground">
                      Poll interval (seconds)
                    </label>
                    <p className="text-[10px] leading-tight text-muted-foreground">
                      How often the worker checks for new queued mentions.
                    </p>
                    <Input
                      id="openclaw-poll-interval"
                      type="number"
                      min={5}
                      max={300}
                      value={openclawConfig.pollIntervalSeconds}
                      onChange={(e) =>
                        setOpenclawConfig((prev) => ({
                          ...prev,
                          pollIntervalSeconds: Number(e.target.value || 30),
                        }))
                      }
                      placeholder="30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="openclaw-max-mentions" className="text-xs text-muted-foreground">
                      Mentions per poll
                    </label>
                    <p className="text-[10px] leading-tight text-muted-foreground">
                      Max queued mentions returned by each poll request.
                    </p>
                    <Input
                      id="openclaw-max-mentions"
                      type="number"
                      min={1}
                      max={20}
                      value={openclawConfig.maxMentionsPerPoll}
                      onChange={(e) =>
                        setOpenclawConfig((prev) => ({
                          ...prev,
                          maxMentionsPerPoll: Number(e.target.value || 5),
                        }))
                      }
                      placeholder="5"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="openclaw-context-count" className="text-xs text-muted-foreground">
                      Context message count
                    </label>
                    <p className="text-[10px] leading-tight text-muted-foreground">
                      Recent room messages included with each mention payload.
                    </p>
                    <Input
                      id="openclaw-context-count"
                      type="number"
                      min={5}
                      max={100}
                      value={openclawConfig.contextMessageCount}
                      onChange={(e) =>
                        setOpenclawConfig((prev) => ({
                          ...prev,
                          contextMessageCount: Number(e.target.value || 20),
                        }))
                      }
                      placeholder="20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="openclaw-lease-seconds" className="text-xs text-muted-foreground">
                      Lease duration (seconds)
                    </label>
                    <p className="text-[10px] leading-tight text-muted-foreground">
                      How long a claimed mention stays reserved before retry.
                    </p>
                    <Input
                      id="openclaw-lease-seconds"
                      type="number"
                      min={30}
                      max={900}
                      value={openclawConfig.leaseSeconds}
                      onChange={(e) =>
                        setOpenclawConfig((prev) => ({
                          ...prev,
                          leaseSeconds: Number(e.target.value || 120),
                        }))
                      }
                      placeholder="120"
                    />
                  </div>
                </div>
              </Field>
            )}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Creating..." : "Create Agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
