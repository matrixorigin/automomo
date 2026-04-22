"use client"

import * as React from "react"
import { CopyIcon, TrashIcon } from "@phosphor-icons/react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useWorkspaceStore } from "@/lib/stores"

export default function SettingsPage() {
  const {
    workspace,
    members,
    invites,
    fetchWorkspace,
    fetchMembers,
    fetchInvites,
    createInvite,
    revokeInvite,
    removeMember,
  } = useWorkspaceStore()

  const [teamError, setTeamError] = React.useState<string | null>(null)
  const [inviteBusy, setInviteBusy] = React.useState(false)
  const [generatedInviteUrl, setGeneratedInviteUrl] = React.useState("")
  const [copiedLatestInvite, setCopiedLatestInvite] = React.useState(false)
  const [removingUserId, setRemovingUserId] = React.useState<string | null>(null)
  const [revokingInviteId, setRevokingInviteId] = React.useState<string | null>(null)
  const [origin, setOrigin] = React.useState("")

  React.useEffect(() => {
    fetchWorkspace()
    fetchMembers()
    fetchInvites()
  }, [fetchWorkspace, fetchMembers, fetchInvites])

  React.useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  React.useEffect(() => {
    if (!copiedLatestInvite) return
    const timeout = setTimeout(() => setCopiedLatestInvite(false), 1500)
    return () => clearTimeout(timeout)
  }, [copiedLatestInvite])

  React.useEffect(() => {
    setCopiedLatestInvite(false)
  }, [generatedInviteUrl])

  const handleCreateInvite = async () => {
    setTeamError(null)
    setInviteBusy(true)
    try {
      const invite = await createInvite()
      setGeneratedInviteUrl(invite.inviteUrl ?? "")
      await fetchInvites()
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Failed to create invite")
    } finally {
      setInviteBusy(false)
    }
  }

  const handleCopyLatestInvite = async () => {
    const copied = await copyText(generatedInviteUrl)
    if (copied) setCopiedLatestInvite(true)
  }

  const handleRevokeInvite = async (inviteId: string) => {
    setTeamError(null)
    setRevokingInviteId(inviteId)
    try {
      await revokeInvite(inviteId)
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Failed to revoke invite")
    } finally {
      setRevokingInviteId(null)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    setTeamError(null)
    setRemovingUserId(userId)
    try {
      await removeMember(userId)
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Failed to remove member")
    } finally {
      setRemovingUserId(null)
    }
  }

  const copyText = async (text: string): Promise<boolean> => {
    if (!text) return false
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      setTeamError("Failed to copy to clipboard")
      return false
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 items-center border-b px-4">
        <h1 className="text-sm font-semibold">Settings</h1>
      </header>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl space-y-8">
          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Team Management</h2>
              <p className="text-xs text-muted-foreground">
                Workspace: {workspace?.name ?? "—"} · Your role: {workspace?.role ?? "—"}
              </p>
            </div>

            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Members</div>
              <div className="divide-y">
                {members.map((member) => {
                  const isSelf = member.userId === workspace?.currentUserId
                  const canRemove = workspace?.role === "OWNER" && !isSelf
                  return (
                    <div key={member.userId} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">
                          {member.user.name} {isSelf ? "(You)" : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">{member.user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded border px-1.5 py-0.5 text-xs">{member.role}</span>
                        {canRemove && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveMember(member.userId)}
                            disabled={removingUserId === member.userId}
                          >
                            <TrashIcon className="h-4 w-4" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {members.length === 0 && (
                  <div className="px-3 py-4 text-xs text-muted-foreground">No members</div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button onClick={handleCreateInvite} disabled={inviteBusy}>
                  {inviteBusy ? "Creating..." : "Create invite link"}
                </Button>
                {generatedInviteUrl && (
                  <Button variant="outline" onClick={handleCopyLatestInvite}>
                    <CopyIcon className="h-4 w-4" />
                    {copiedLatestInvite ? "Copied" : "Copy latest link"}
                  </Button>
                )}
              </div>
              {generatedInviteUrl && <Input value={generatedInviteUrl} readOnly />}
            </div>

            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Pending invite links</div>
              <div className="divide-y">
                {invites.map((invite) => {
                  const inviteUrl =
                    invite.inviteUrl ??
                    (origin ? `${origin}/signup?invite=${invite.id}` : "")
                  return (
                    <div key={invite.id} className="space-y-2 px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(invite.createdAt).toLocaleString()}
                      </p>
                      <div className="flex items-center gap-2">
                        <Input value={inviteUrl} readOnly />
                        <Button variant="outline" onClick={() => copyText(inviteUrl)} disabled={!inviteUrl}>
                          <CopyIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleRevokeInvite(invite.id)}
                          disabled={revokingInviteId === invite.id}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
                {invites.length === 0 && (
                  <div className="px-3 py-4 text-xs text-muted-foreground">No pending invites</div>
                )}
              </div>
            </div>

            {teamError && <p className="text-sm text-destructive">{teamError}</p>}
          </section>
        </div>
      </div>
    </div>
  )
}
