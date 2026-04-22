"use client"

import * as React from "react"
import {
  ClipboardTextIcon,
  FileTextIcon,
  GitDiffIcon,
  GitPullRequestIcon,
  NotepadIcon,
  TerminalWindowIcon,
  ArrowSquareOutIcon,
} from "@phosphor-icons/react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useArtifactStore } from "@/lib/stores"
import type { Artifact, ArtifactType } from "@/lib/types"
type ArtifactIcon = React.ComponentType<{ className?: string }>

const typeConfig: Record<ArtifactType, { label: string; icon: ArtifactIcon }> = {
  plan: { label: "Plans", icon: NotepadIcon },
  patch: { label: "Patches", icon: GitDiffIcon },
  review: { label: "Reviews", icon: ClipboardTextIcon },
  pr: { label: "PRs", icon: GitPullRequestIcon },
  document: { label: "Documents", icon: FileTextIcon },
  log: { label: "Logs", icon: TerminalWindowIcon },
}

const artifactSections: ArtifactType[] = ["plan", "patch", "review", "pr", "document", "log"]

function normalizeArtifactType(type: string): ArtifactType {
  return artifactSections.includes(type as ArtifactType) ? (type as ArtifactType) : "document"
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const config = typeConfig[normalizeArtifactType(artifact.type)]
  const Icon = config?.icon ?? FileTextIcon
  const ownerName = artifact.agent?.name ?? (artifact.createdBy ? "Unknown agent" : "You")
  const ownerColor = artifact.agent?.color
  const preview = artifact.content.trim()

  return (
    <div className="flex gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors cursor-pointer overflow-hidden">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{artifact.title}</div>
        {preview && (
          <div className="mt-1 max-h-8 overflow-hidden text-[11px] leading-4 text-muted-foreground">
            {preview}
          </div>
        )}
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          {ownerColor && (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: ownerColor }}
            />
          )}
          <span className="truncate">{ownerName}</span>
        </div>
      </div>
      {artifact.url && (
        <a
          href={artifact.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowSquareOutIcon className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  )
}

function ArtifactSection({ type, artifacts }: { type: ArtifactType; artifacts: Artifact[] }) {
  const config = typeConfig[type]
  if (artifacts.length === 0) return null

  return (
    <div>
      <h3 className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {config.label}
      </h3>
      <div className="space-y-1 px-4">
        {artifacts.map((a) => (
          <ArtifactCard key={a.id} artifact={a} />
        ))}
      </div>
    </div>
  )
}

export function ArtifactsPanel({ roomId }: { roomId: string }) {
  const { artifactsByRoom, fetchArtifacts } = useArtifactStore()
  const artifacts = artifactsByRoom[roomId] || []

  React.useEffect(() => {
    fetchArtifacts(roomId)
  }, [roomId, fetchArtifacts])

  const grouped = React.useMemo(() => {
    const groups: Record<ArtifactType, Artifact[]> = {
      plan: [],
      patch: [],
      review: [],
      pr: [],
      document: [],
      log: [],
    }
    for (const a of artifacts) {
      groups[normalizeArtifactType(a.type)].push(a)
    }
    return groups
  }, [artifacts])

  const presentSections = artifactSections.filter((type) => grouped[type].length > 0)

  return (
    <ScrollArea className="h-full">
      <div className="py-4 space-y-4">
        {artifacts.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No artifacts yet.
          </div>
        ) : (
          <>
            {presentSections.map((type, index) => (
              <React.Fragment key={type}>
                <ArtifactSection type={type} artifacts={grouped[type]} />
                {index < presentSections.length - 1 && <Separator className="mx-4" />}
              </React.Fragment>
            ))}
          </>
        )}
      </div>
    </ScrollArea>
  )
}
