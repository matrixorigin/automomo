# Oz-First Automomo Rewrite Implementation Plan

**Goal:** Rebuild automomo around the Oz Workspace room/chat/orchestration product model while replacing Oz's cloud runtime harness with automomo's local daemon runtime.
**Architecture:** `apps/web` becomes the Oz-derived Next.js workspace app. `apps/daemon`, `packages/protocol`, and `packages/pi-runtime` remain as the local execution layer. The current Hono control plane becomes legacy during the transition and is removed after the Oz-derived app owns daemon leases, room chat, fan-out/fan-in, and local runtime completion.
**Tech Stack:** Next.js App Router, Prisma 7, SQLite/libSQL, NextAuth, Zustand, SSE, pnpm workspaces, TypeScript, Vitest, automomo daemon, Pi Mono runtime adapter.

---

## Source And Scope

Input sources:

- User direction: fork Oz conceptually, use automomo as the target repo, and make the local daemon harness the first runtime replacement.
- Oz source repo: `/Users/randomradio/src/oz-workspace`
- Current automomo repo: `/Users/randomradio/src/mo/automomo`
- Handoff doc: `docs/plans/2026-04-22-oz-workspace-investigation-handoff.md`

Scope:

- Replace the current automomo web product shape with the Oz workspace product shape.
- Keep the automomo repo and pnpm workspace.
- Keep `apps/daemon`, `packages/protocol`, and `packages/pi-runtime`.
- Move Oz's Next app, Prisma model, rooms, agents, mentions, fan-out/fan-in, tasks, artifacts, notifications, auth, and SSE into `apps/web`.
- Replace the Oz runtime dispatch dependency with a new automomo local daemon harness.
- Preserve the Oz harness as optional only if keeping it costs less than deleting it.
- Retire `apps/api` only after the Next app exposes compatible local daemon routes and tests pass.

Out of scope for this plan:

- Production Redis rollout.
- Hosted cloud runtime.
- GitHub connector ingestion.
- Browser automation for agent computer use.
- Multi-tenant billing or enterprise auth.

Complexity: large. This is a repo-level product reset with a runtime-layer rewrite, so the work is decomposed into small testable slices.

## Research Summary

Oz Workspace already provides the core product behavior automomo now wants:

- Room-first workspace UI in `app/(workspace)/room/[roomId]` and room/sidebar components.
- Chat messages in `app/api/messages/route.ts`.
- Server-side mention resolution in `lib/mention-dispatch.ts`.
- Agent invocation and recursive delegation in `lib/invoke-agent.ts`.
- Fan-out/fan-in orchestration in `app/api/agent-response/route.ts`.
- Durable orchestration state through `AgentOrchestration` and `AgentOrchestrationChild`.
- Local-style polling harness through `AgentMention`, `/api/agent/mentions/poll`, and `/api/agent/mentions/respond`.
- SSE through `lib/event-broadcaster.ts`, `app/api/events/route.ts`, and `hooks/use-realtime.ts`.

Automomo already provides the differentiated runtime layer:

- `apps/daemon/src/worker.ts` registers a runtime, polls a lease, runs Pi, uploads events, and uploads structured outcomes.
- `apps/daemon/src/client.ts` signs daemon requests with HMAC.
- `packages/pi-runtime/src/index.ts` adapts an automomo session into a Pi runtime prompt and structured outcome.
- Current tests cover daemon registration, lease security, failure upload, local repo runtime execution, and Pi adapter behavior.

Framework constraints:

- Next.js Route Handlers can stream raw `ReadableStream` responses, which fits Oz's SSE implementation.
- Prisma Migrate keeps schema history in SQL migrations and supports SQLite/libSQL, which fits importing Oz's Prisma model plus automomo runtime tables.

## Architecture Decision

Recommended option: **Oz-first monorepo rewrite**.

Keep the automomo workspace layout, but make `apps/web` an Oz-derived app:

```text
automomo/
  apps/
    web/        # Oz-derived Next.js app, Prisma DB, room UI, API routes
    daemon/     # automomo local runtime daemon, adapted to Oz local harness
    api/        # legacy Hono app during migration, deleted after parity
  packages/
    protocol/   # shared daemon/runtime schemas
    pi-runtime/ # Pi runtime adapter
  docs/
    plans/
```

The key rewrite is the runtime seam:

```text
Human/Agent message
  -> Oz mention resolver
  -> invokeAgent()
  -> harness dispatcher
      -> oz harness: existing Warp/Oz SDK path
      -> automomo-daemon harness: create AgentRun lease
  -> local daemon polls and claims AgentRun
  -> Pi runtime runs against local workspaceRoot
  -> daemon uploads response/outcome
  -> shared completion service creates room Message
  -> fan-in service updates orchestration
  -> SSE updates room
```

Use these new app-level concepts:

- `Runtime`: reusable local execution environment. One runtime can support many agents.
- `Daemon`: local process that owns or serves a runtime.
- `AgentRun`: one executable run for one agent. Its id is the `runId` used by Oz orchestration children.
- `Agent.harness = "automomo-daemon"` for local agents.
- `Agent.runtimeId` points to the runtime the daemon will claim from.

Do not keep WorkItem/Session as the main product model in the Oz-first app. Oz `Task` is the room kanban unit. Automomo's old WorkItem/Session model can remain in legacy `apps/api` until removed.

## Public Interfaces

### Agent Harness Interface

Create `apps/web/lib/harnesses/types.ts`:

```ts
import type { Agent, Room } from "@/lib/generated/prisma"

export type AgentHarnessName = "oz" | "automomo-daemon"

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
```

### Local Daemon API

Add these Next route handlers under `apps/web/app/api/daemon`:

- `POST /api/daemon/register`
- `POST /api/daemon/heartbeat`
- `POST /api/daemon/lease`
- `POST /api/daemon/lease/renew`
- `POST /api/daemon/events`
- `POST /api/daemon/outcome`
- `POST /api/daemon/fail`

The daemon-facing wire shape should stay close to current automomo so `apps/daemon` changes are small:

```ts
export interface AgentRunLease {
  leaseId: string
  run: {
    id: string
    roomId: string
    agentId: string
    runtimeId: string
    prompt: string
    sourceMessageId: string | null
    depth: number
  }
  room: {
    id: string
    name: string
    description: string
  }
  agent: {
    id: string
    name: string
    systemPrompt: string
    skills: string[]
    mcpServers: unknown[]
  }
  runtime: {
    id: string
    name: string
    provider: string
    workspaceRoot: string | null
    environment: Record<string, unknown>
  }
  context: Array<{
    id: string
    authorType: string
    authorName: string
    content: string
    timestamp: string
  }>
  expiresAt: string
}
```

### Completion Service

Create a shared service so Oz callbacks and automomo daemon outcomes use the same room/fan-in behavior:

```text
apps/web/lib/agent-run-completion.ts
```

Responsibilities:

- Upsert the agent response message using `runId` as the message id.
- Mark agent idle when no more active runs exist.
- Mark `AgentRun` completed or failed.
- Mark `AgentOrchestrationChild` completed or failed when `runId` is a child.
- When all children are complete, create the lead follow-up run exactly once.
- Resolve any `@agent` mentions in the agent response and recursively dispatch them.
- Broadcast message and room events through SSE.

## Task Decomposition

### Task 1: Snapshot Safety And Oz Import Boundary

**Files:**

- Modify: `package.json`
- Modify: `apps/web/package.json`
- Replace: `apps/web/app`
- Replace: `apps/web/components`
- Replace: `apps/web/hooks`
- Replace: `apps/web/lib`
- Replace: `apps/web/prisma`
- Replace: `apps/web/public`
- Preserve: `apps/daemon`
- Preserve: `packages/protocol`
- Preserve: `packages/pi-runtime`
- Preserve: `docs/plans`

**Goal:** Make `apps/web` structurally match Oz Workspace while keeping automomo runtime packages in the pnpm monorepo.
**Criteria:** `pnpm --filter @automomo/web typecheck` reaches real TypeScript errors from integration drift, not missing files.

- [ ] Step 1: Write a tracking note in the implementation log before moving files.

  ```markdown
  Imported Oz Workspace into apps/web while preserving automomo daemon/runtime packages.
  Source: /Users/randomradio/src/oz-workspace
  Excluded: .git, node_modules, .env.local, prisma/dev.db, captures
  ```

- [ ] Step 2: Replace the current `apps/web` app surface with Oz source files.

  Run during execution:

  ```bash
  rm -rf apps/web/app apps/web/components apps/web/hooks apps/web/lib apps/web/prisma apps/web/public apps/web/src
  rsync -a \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude '.env.local' \
    --exclude 'prisma/dev.db' \
    --exclude 'captures' \
    /Users/randomradio/src/oz-workspace/app \
    /Users/randomradio/src/oz-workspace/components \
    /Users/randomradio/src/oz-workspace/hooks \
    /Users/randomradio/src/oz-workspace/lib \
    /Users/randomradio/src/oz-workspace/prisma \
    /Users/randomradio/src/oz-workspace/public \
    apps/web/
  cp /Users/randomradio/src/oz-workspace/components.json apps/web/components.json
  cp /Users/randomradio/src/oz-workspace/next.config.ts apps/web/next.config.ts
  cp /Users/randomradio/src/oz-workspace/postcss.config.mjs apps/web/postcss.config.mjs
  cp /Users/randomradio/src/oz-workspace/eslint.config.mjs apps/web/eslint.config.mjs
  ```

- [ ] Step 3: Convert Oz's npm package into the automomo pnpm package.

  `apps/web/package.json` should keep the package name `@automomo/web`, use Oz dependencies, and add workspace dependencies:

  ```json
  {
    "name": "@automomo/web",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "scripts": {
      "dev": "next dev --port 3000",
      "build": "prisma generate --schema prisma/schema.prisma && next build",
      "start": "next start",
      "lint": "eslint",
      "test": "vitest run",
      "typecheck": "tsc --noEmit",
      "db:push": "prisma db push --schema prisma/schema.prisma",
      "db:generate": "prisma generate --schema prisma/schema.prisma"
    },
    "dependencies": {
      "@automomo/protocol": "workspace:*",
      "@base-ui/react": "^1.1.0",
      "@libsql/client": "^0.17.0",
      "@phosphor-icons/react": "^2.1.10",
      "@prisma/adapter-libsql": "^7.3.0",
      "@prisma/client": "^7.3.0",
      "@tanstack/react-virtual": "^3.13.18",
      "@types/bcryptjs": "^2.4.6",
      "@upstash/redis": "^1.36.2",
      "bcryptjs": "^3.0.3",
      "class-variance-authority": "^0.7.1",
      "clsx": "^2.1.1",
      "immer": "^11.1.4",
      "next": "16.1.6",
      "next-auth": "^5.0.0-beta.30",
      "oz-agent-sdk": "^1.0.0-alpha.8",
      "prisma": "^7.3.0",
      "radix-ui": "^1.4.3",
      "react": "19.2.3",
      "react-dom": "19.2.3",
      "react-markdown": "^10.1.0",
      "react-resizable-panels": "^4.6.2",
      "remark-gfm": "^4.0.1",
      "shadcn": "^3.8.4",
      "tailwind-merge": "^3.4.0",
      "tw-animate-css": "^1.4.0",
      "zustand": "^5.0.11"
    },
    "devDependencies": {
      "@tailwindcss/postcss": "^4",
      "@types/node": "^20",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      "dotenv": "^17.2.4",
      "eslint": "^9",
      "eslint-config-next": "16.1.6",
      "typescript": "^5",
      "vitest": "^3.2.4"
    }
  }
  ```

- [ ] Step 4: Verify import boundary.

  Run:

  ```bash
  pnpm install
  pnpm --filter @automomo/web db:generate
  pnpm --filter @automomo/web typecheck
  ```

  Expected:

  - Dependency installation succeeds.
  - Prisma client generation succeeds.
  - Typecheck failures are integration-specific and are fixed in later tasks.

- [ ] Step 5: Commit.

  ```bash
  git commit -m "chore: import oz workspace into automomo web app"
  ```

### Task 2: Prisma Runtime Schema

**Files:**

- Modify: `apps/web/prisma/schema.prisma`
- Test: `apps/web/test/runtime-schema.test.ts`

**Goal:** Add automomo runtime entities to Oz's Prisma model without disturbing room/chat/orchestration semantics.
**Criteria:** Prisma generates a client and schema tests can create a runtime, daemon, agent run, and lease.

- [ ] Step 1: Add Vitest config for `apps/web` if missing.

  Create `apps/web/vitest.config.ts`:

  ```ts
  import { defineConfig } from "vitest/config"

  export default defineConfig({
    test: {
      environment: "node",
      include: ["test/**/*.test.ts"],
      globals: false
    },
    resolve: {
      alias: {
        "@": new URL(".", import.meta.url).pathname
      }
    }
  })
  ```

- [ ] Step 2: Add runtime fields to `Agent`.

  ```prisma
  runtimeId String?
  runtime   Runtime? @relation(fields: [runtimeId], references: [id], onDelete: SetNull)
  runs      AgentRun[]

  @@index([runtimeId])
  ```

- [ ] Step 3: Add runtime models.

  ```prisma
  model Runtime {
    id              String   @id @default(cuid())
    name            String
    provider        String   @default("pi")
    mode            String   @default("remote_daemon")
    workspaceRoot   String   @default("")
    environmentJson String   @default("{}")
    status          String   @default("offline")
    capacity        Int      @default(1)
    activeRuns      Int      @default(0)
    lastHeartbeatAt DateTime?
    createdAt       DateTime @default(now())
    updatedAt       DateTime @updatedAt

    agents  Agent[]
    daemons Daemon[]
    runs    AgentRun[]
    leases  AgentRunLease[]
  }

  model Daemon {
    id               String   @id @default(cuid())
    runtimeId        String
    name             String
    secretHash       String
    secretPreview    String
    signatureVersion String   @default("hmac-sha256-v1")
    status           String   @default("online")
    lastSeenAt       DateTime?
    createdAt        DateTime @default(now())
    updatedAt        DateTime @updatedAt

    runtime Runtime        @relation(fields: [runtimeId], references: [id], onDelete: Cascade)
    leases  AgentRunLease[]

    @@index([runtimeId])
  }

  model AgentRun {
    id               String   @id
    roomId           String
    agentId          String
    runtimeId        String?
    sourceMessageId  String?
    prompt           String
    depth            Int      @default(0)
    harness          String   @default("automomo-daemon")
    status           String   @default("queued")
    claimedAt        DateTime?
    leaseExpiresAt   DateTime?
    completedAt      DateTime?
    responseMessageId String?
    sessionUrl       String?
    failureReason    String?
    metadataJson     String   @default("{}")
    createdAt        DateTime @default(now())
    updatedAt        DateTime @updatedAt

    room    Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
    agent   Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
    runtime Runtime? @relation(fields: [runtimeId], references: [id], onDelete: SetNull)
    leases  AgentRunLease[]

    @@index([roomId, status, createdAt])
    @@index([agentId, status, createdAt])
    @@index([runtimeId, status, createdAt])
    @@unique([agentId, sourceMessageId])
  }

  model AgentRunLease {
    id          String   @id @default(cuid())
    runId       String
    runtimeId   String
    daemonId    String
    status      String   @default("active")
    createdAt   DateTime @default(now())
    renewedAt   DateTime?
    expiresAt   DateTime
    completedAt DateTime?

    run     AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)
    runtime Runtime  @relation(fields: [runtimeId], references: [id], onDelete: Cascade)
    daemon  Daemon   @relation(fields: [daemonId], references: [id], onDelete: Cascade)

    @@index([runId])
    @@index([runtimeId, status, expiresAt])
    @@index([daemonId, status])
  }
  ```

- [ ] Step 4: Add relation fields on `Room`.

  ```prisma
  runs AgentRun[]
  ```

- [ ] Step 5: Write schema smoke test.

  Create `apps/web/test/runtime-schema.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest"

  describe("runtime schema contract", () => {
    it("defines reusable runtime and daemon run models", async () => {
      const schema = await import("node:fs/promises").then((fs) =>
        fs.readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8")
      )

      expect(schema).toContain("model Runtime")
      expect(schema).toContain("model Daemon")
      expect(schema).toContain("model AgentRun")
      expect(schema).toContain("model AgentRunLease")
      expect(schema).toContain("runtimeId String?")
      expect(schema).toContain("harness          String   @default(\"automomo-daemon\")")
    })
  })
  ```

- [ ] Step 6: Verify.

  Run:

  ```bash
  pnpm --filter @automomo/web test -- runtime-schema
  pnpm --filter @automomo/web db:generate
  ```

  Expected: pass.

- [ ] Step 7: Commit.

  ```bash
  git commit -m "feat: add oz-local runtime schema"
  ```

### Task 3: Harness Dispatcher

**Files:**

- Create: `apps/web/lib/harnesses/types.ts`
- Create: `apps/web/lib/harnesses/daemon.ts`
- Create: `apps/web/lib/harnesses/oz.ts`
- Create: `apps/web/lib/harnesses/index.ts`
- Modify: `apps/web/lib/invoke-agent.ts`
- Test: `apps/web/test/harness-dispatch.test.ts`

**Goal:** Decouple Oz's room/orchestration logic from Warp-specific execution.
**Criteria:** Dispatching an `automomo-daemon` agent creates an `AgentRun`; dispatching an `oz` agent still goes through the existing Oz path.

- [ ] Step 1: Write failing test for daemon harness selection.

  Create `apps/web/test/harness-dispatch.test.ts`:

  ```ts
  import { describe, expect, it, vi } from "vitest"
  import { selectHarness } from "../lib/harnesses"

  describe("selectHarness", () => {
    it("uses the automomo daemon harness for local runtime agents", () => {
      const harness = selectHarness({ harness: "automomo-daemon" })
      expect(harness.name).toBe("automomo-daemon")
    })

    it("keeps the Oz harness for legacy Oz agents", () => {
      const harness = selectHarness({ harness: "oz" })
      expect(harness.name).toBe("oz")
    })

    it("rejects unsupported harnesses with the harness name in the error", () => {
      expect(() => selectHarness({ harness: "claude-code" })).toThrow("Unsupported agent harness: claude-code")
    })
  })
  ```

- [ ] Step 2: Verify test fails.

  Run:

  ```bash
  pnpm --filter @automomo/web test -- harness-dispatch
  ```

  Expected: fail because `lib/harnesses` does not exist.

- [ ] Step 3: Implement harness selection.

  `apps/web/lib/harnesses/index.ts`:

  ```ts
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
  ```

  `apps/web/lib/harnesses/daemon.ts` creates an `AgentRun` with `status: "queued"` and returns `{ runId, status: "queued", sessionUrl: null, immediateMessage: null }`.

  `apps/web/lib/harnesses/oz.ts` wraps the existing `runAgent` and `pollForCompletion` behavior currently embedded in `invoke-agent.ts`.

- [ ] Step 4: Refactor `invokeAgent()`.

  Keep prompt assembly, depth guard, room pause guard, teammate context, task context, and agent status updates in `invokeAgent()`.

  Replace direct `runAgent()` usage with:

  ```ts
  const harness = selectHarness(agent)
  const dispatch = await harness.dispatch({
    invocationId,
    room,
    agent,
    prompt,
    depth,
    userId,
    workspaceId: effectiveWorkspaceId,
    callbackUrl,
    chatHistory,
    taskSummary,
    teammateInstructions,
    roomContext,
  })
  ```

  For `automomo-daemon`, return success immediately after queuing the run. The daemon completion route creates the eventual room message.

- [ ] Step 5: Verify.

  Run:

  ```bash
  pnpm --filter @automomo/web test -- harness-dispatch
  pnpm --filter @automomo/web typecheck
  ```

  Expected: pass.

- [ ] Step 6: Commit.

  ```bash
  git commit -m "feat: add agent harness dispatcher"
  ```

### Task 4: Shared Agent Completion Service

**Files:**

- Create: `apps/web/lib/agent-run-completion.ts`
- Modify: `apps/web/app/api/agent-response/route.ts`
- Test: `apps/web/test/agent-run-completion.test.ts`

**Goal:** Make Oz callbacks and local daemon outcomes complete runs through the same path.
**Criteria:** Completing a run creates one room message, updates agent status, broadcasts SSE events, and can trigger fan-in.

- [ ] Step 1: Write tests around pure completion helpers.

  Create `apps/web/test/agent-run-completion.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest"
  import { sanitizeDelegateText, trimForPrompt } from "../lib/agent-run-completion"

  describe("agent run completion helpers", () => {
    it("sanitizes delegate mentions before fan-in prompt construction", () => {
      expect(sanitizeDelegateText("Ask @Builder and @Reviewer")).toBe("Ask ＠Builder and ＠Reviewer")
    })

    it("trims long delegate text with a byte-count style suffix", () => {
      expect(trimForPrompt("abcdef", 3)).toBe("abc\n\n[truncated 3 chars]")
    })
  })
  ```

- [ ] Step 2: Verify test fails.

  Run:

  ```bash
  pnpm --filter @automomo/web test -- agent-run-completion
  ```

  Expected: fail because the service does not exist.

- [ ] Step 3: Move completion logic into the service.

  Export:

  ```ts
  export function sanitizeDelegateText(text: string) {
    return text.replaceAll("@", "＠")
  }

  export function trimForPrompt(text: string, maxChars: number) {
    if (text.length <= maxChars) return text
    return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} chars]`
  }
  ```

  Add `completeAgentRun(input)` with these required fields:

  ```ts
  {
    runId: string
    roomId: string
    agentId: string
    messageText: string
    sessionUrl: string | null
    userId: string | null
    workspaceId: string | undefined
    source: "oz-callback" | "automomo-daemon"
  }
  ```

  The function must perform the same message upsert and fan-in behavior currently inside `app/api/agent-response/route.ts`.

- [ ] Step 4: Refactor `app/api/agent-response/route.ts`.

  Keep request parsing and artifact persistence in the route. Replace duplicated message/fan-in/recursive dispatch logic with `completeAgentRun()`.

- [ ] Step 5: Verify.

  Run:

  ```bash
  pnpm --filter @automomo/web test -- agent-run-completion
  pnpm --filter @automomo/web typecheck
  ```

  Expected: pass.

- [ ] Step 6: Commit.

  ```bash
  git commit -m "refactor: share agent run completion flow"
  ```

### Task 5: Local Daemon Auth And Registration

**Files:**

- Create: `apps/web/lib/daemon-auth.ts`
- Create: `apps/web/app/api/daemon/register/route.ts`
- Create: `apps/web/app/api/daemon/heartbeat/route.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `apps/web/test/daemon-auth.test.ts`

**Goal:** Let a local daemon register and update runtime health inside the Oz-derived Next app.
**Criteria:** Registration returns runtime, daemon id, and secret once; heartbeat updates runtime status only with a valid signature.

- [ ] Step 1: Port automomo HMAC signing schemas into `packages/protocol`.

  Keep the existing names:

  - `DaemonRegistrationSchema`
  - `DaemonRegistrationResponseSchema`
  - `RuntimeHeartbeatSchema`
  - `DaemonSignedRequestHeadersSchema`

- [ ] Step 2: Implement `daemon-auth.ts`.

  Required functions:

  ```ts
  export function hashDaemonSecret(secret: string): string
  export function verifyDaemonSecret(secret: string, hash: string): boolean
  export function buildDaemonSignature(input: {
    method: string
    path: string
    timestamp: string
    bodyText: string
    daemonId: string
    runtimeId: string
    nonce: string
    secret: string
  }): string
  export async function requireSignedDaemonRequest(request: Request, bodyText: string): Promise<{
    daemonId: string
    runtimeId: string
  }>
  ```

- [ ] Step 3: Write auth tests.

  Create `apps/web/test/daemon-auth.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest"
  import { buildDaemonSignature, hashDaemonSecret, verifyDaemonSecret } from "../lib/daemon-auth"

  describe("daemon auth", () => {
    it("hashes and verifies daemon secrets", () => {
      const hash = hashDaemonSecret("secret-value")
      expect(verifyDaemonSecret("secret-value", hash)).toBe(true)
      expect(verifyDaemonSecret("wrong", hash)).toBe(false)
    })

    it("builds deterministic HMAC signatures for the same canonical request", () => {
      const input = {
        method: "POST",
        path: "/api/daemon/heartbeat",
        timestamp: "2026-04-22T00:00:00.000Z",
        bodyText: "{\"runtimeId\":\"runtime_1\"}",
        daemonId: "daemon_1",
        runtimeId: "runtime_1",
        nonce: "nonce_1",
        secret: "secret_1"
      }
      expect(buildDaemonSignature(input)).toBe(buildDaemonSignature(input))
    })
  })
  ```

- [ ] Step 4: Implement registration.

  `POST /api/daemon/register`:

  - Accepts daemon name, optional runtime id, provider, and environment.
  - Creates or updates `Runtime`.
  - Creates or updates `Daemon`.
  - Returns a new cleartext secret only on registration response.
  - Stores only a hash and preview.

- [ ] Step 5: Implement heartbeat.

  `POST /api/daemon/heartbeat`:

  - Requires HMAC signature.
  - Updates `Runtime.status`, `Runtime.capacity`, `Runtime.activeRuns`, and `Runtime.lastHeartbeatAt`.
  - Updates `Daemon.lastSeenAt`.

- [ ] Step 6: Verify.

  Run:

  ```bash
  pnpm --filter @automomo/web test -- daemon-auth
  pnpm --filter @automomo/web typecheck
  ```

  Expected: pass.

- [ ] Step 7: Commit.

  ```bash
  git commit -m "feat: add local daemon registration"
  ```

### Task 6: Web Test Database Helper

**Files:**

- Create: `apps/web/test/helpers/test-db.ts`
- Modify: `apps/web/test/daemon-lease.test.ts`
- Modify: `apps/web/test/harness-dispatch.test.ts`

**Goal:** Make app-route and Prisma tests deterministic with isolated SQLite databases.
**Criteria:** Each test gets a clean SQLite database and generated Prisma client can connect.

- [ ] Step 1: Create helper.

  `apps/web/test/helpers/test-db.ts`:

  ```ts
  import { mkdtempSync, rmSync } from "node:fs"
  import { tmpdir } from "node:os"
  import { join } from "node:path"
  import { execFileSync } from "node:child_process"

  export function withTestDatabase<T>(fn: (input: { dir: string; databaseUrl: string }) => Promise<T>) {
    return async () => {
      const dir = mkdtempSync(join(tmpdir(), "automomo-oz-db-"))
      const previousDatabaseUrl = process.env.DATABASE_URL
      const previousTursoDatabaseUrl = process.env.TURSO_DATABASE_URL
      const databaseUrl = `file:${join(dir, "test.sqlite")}`
      process.env.DATABASE_URL = databaseUrl
      process.env.TURSO_DATABASE_URL = databaseUrl
      execFileSync("pnpm", ["--filter", "@automomo/web", "prisma", "db", "push", "--schema", "prisma/schema.prisma"], {
        stdio: "pipe"
      })
      try {
        return await fn({ dir, databaseUrl })
      } finally {
        if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
        else process.env.DATABASE_URL = previousDatabaseUrl
        if (previousTursoDatabaseUrl === undefined) delete process.env.TURSO_DATABASE_URL
        else process.env.TURSO_DATABASE_URL = previousTursoDatabaseUrl
        rmSync(dir, { recursive: true, force: true })
      }
    }
  }
  ```

- [ ] Step 2: Use the helper in route tests.

  Every route test that writes through Prisma should wrap its body with:

  ```ts
  it("uses an isolated sqlite database", withTestDatabase(async () => {
    expect(process.env.DATABASE_URL).toContain("automomo-oz-db-")
  }))
  ```

- [ ] Step 3: Verify.

  Run:

  ```bash
  pnpm --filter @automomo/web test -- runtime-schema
  pnpm --filter @automomo/web test -- harness-dispatch
  ```

  Expected: pass.

- [ ] Step 4: Commit.

  ```bash
  git commit -m "test: add isolated web database helper"
  ```

### Task 7: Local Daemon Lease Routes

**Files:**

- Create: `apps/web/app/api/daemon/lease/route.ts`
- Create: `apps/web/app/api/daemon/lease/renew/route.ts`
- Create: `apps/web/app/api/daemon/events/route.ts`
- Create: `apps/web/app/api/daemon/outcome/route.ts`
- Create: `apps/web/app/api/daemon/fail/route.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `apps/web/test/daemon-lease.test.ts`

**Goal:** Let the local daemon claim queued `AgentRun`s and complete them into Oz room messages.
**Criteria:** A queued local run can be claimed, renewed, completed, failed, and rejected after lease expiration.

- [ ] Step 1: Add protocol schemas.

  Add:

  - `AgentRunLeaseSchema`
  - `AgentRunLeaseResponseSchema`
  - `AgentRunEventUploadSchema`
  - `AgentRunOutcomeUploadSchema`
  - `AgentRunFailureUploadSchema`

- [ ] Step 2: Write route-level tests.

  Create `apps/web/test/daemon-lease.test.ts` with these cases:

  ```ts
  import { describe, expect, it } from "vitest"
  import { withTestDatabase } from "./helpers/test-db"
  import { prisma } from "../lib/prisma"
  import { POST as registerDaemon } from "../app/api/daemon/register/route"
  import { POST as claimLease } from "../app/api/daemon/lease/route"
  import { POST as renewLease } from "../app/api/daemon/lease/renew/route"
  import { POST as uploadOutcome } from "../app/api/daemon/outcome/route"
  import { buildDaemonSignature } from "../lib/daemon-auth"

  function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
    return new Request(`http://automomo.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body)
    })
  }

  function signedHeaders(path: string, body: unknown, identity: { daemonId: string; runtimeId: string; secret: string }) {
    const bodyText = JSON.stringify(body)
    const timestamp = "2026-04-22T00:00:00.000Z"
    const nonce = `nonce-${path.replaceAll("/", "-")}`
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
        secret: identity.secret
      })
    }
  }

  describe("daemon lease routes", () => {
    it("returns null when no queued runs exist", withTestDatabase(async () => {
      const registration = await registerDaemon(jsonRequest("/api/daemon/register", {
        runtimeId: "runtime_1",
        name: "Local daemon",
        provider: "pi",
        environment: { workspaceRoot: "/repo" }
      }))
      const identity = await registration.json()
      const body = { runtimeId: "runtime_1" }
      const response = await claimLease(jsonRequest("/api/daemon/lease", body, signedHeaders("/api/daemon/lease", body, {
        daemonId: identity.daemon.id,
        runtimeId: "runtime_1",
        secret: identity.secret
      })))
      await expect(response.json()).resolves.toEqual({ lease: null })
    }))

    it("claims the oldest queued AgentRun for the daemon runtime", withTestDatabase(async () => {
      await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
      await prisma.room.create({ data: { id: "room_1", name: "Room", workspaceId: "workspace_1" } })
      await prisma.runtime.create({ data: { id: "runtime_1", name: "Runtime", workspaceRoot: "/repo" } })
      await prisma.agent.create({ data: { id: "agent_1", name: "Builder", harness: "automomo-daemon", runtimeId: "runtime_1", workspaceId: "workspace_1" } })
      await prisma.agentRun.create({ data: { id: "run_1", roomId: "room_1", agentId: "agent_1", runtimeId: "runtime_1", prompt: "Build it", sourceMessageId: "msg_1" } })
      const registration = await registerDaemon(jsonRequest("/api/daemon/register", { runtimeId: "runtime_1", name: "Local daemon", provider: "pi", environment: { workspaceRoot: "/repo" } }))
      const identity = await registration.json()
      const body = { runtimeId: "runtime_1" }
      const response = await claimLease(jsonRequest("/api/daemon/lease", body, signedHeaders("/api/daemon/lease", body, { daemonId: identity.daemon.id, runtimeId: "runtime_1", secret: identity.secret })))
      const payload = await response.json()
      expect(payload.lease.run.id).toBe("run_1")
      expect(payload.lease.agent.id).toBe("agent_1")
    }))

    it("renews an active lease owned by the daemon", withTestDatabase(async () => {
      await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
      await prisma.room.create({ data: { id: "room_1", name: "Room", workspaceId: "workspace_1" } })
      await prisma.runtime.create({ data: { id: "runtime_1", name: "Runtime", workspaceRoot: "/repo" } })
      await prisma.agent.create({ data: { id: "agent_1", name: "Builder", harness: "automomo-daemon", runtimeId: "runtime_1", workspaceId: "workspace_1" } })
      await prisma.agentRun.create({ data: { id: "run_1", roomId: "room_1", agentId: "agent_1", runtimeId: "runtime_1", prompt: "Build it", sourceMessageId: "msg_1" } })
      const registration = await registerDaemon(jsonRequest("/api/daemon/register", { runtimeId: "runtime_1", name: "Local daemon", provider: "pi", environment: { workspaceRoot: "/repo" } }))
      const identity = await registration.json()
      const leaseBody = { runtimeId: "runtime_1" }
      const leaseResponse = await claimLease(jsonRequest("/api/daemon/lease", leaseBody, signedHeaders("/api/daemon/lease", leaseBody, { daemonId: identity.daemon.id, runtimeId: "runtime_1", secret: identity.secret })))
      const leasePayload = await leaseResponse.json()
      const renewBody = { runtimeId: "runtime_1", leaseId: leasePayload.lease.leaseId }
      const response = await renewLease(jsonRequest("/api/daemon/lease/renew", renewBody, signedHeaders("/api/daemon/lease/renew", renewBody, { daemonId: identity.daemon.id, runtimeId: "runtime_1", secret: identity.secret })))
      expect(response.status).toBe(200)
    }))

    it("creates an agent room message when a leased run completes", withTestDatabase(async () => {
      await prisma.workspace.create({ data: { id: "workspace_1", name: "Workspace" } })
      await prisma.user.create({ data: { id: "user_1", name: "User", email: "user@example.com", passwordHash: "hash" } })
      await prisma.room.create({ data: { id: "room_1", name: "Room", workspaceId: "workspace_1", userId: "user_1" } })
      await prisma.runtime.create({ data: { id: "runtime_1", name: "Runtime", workspaceRoot: "/repo" } })
      await prisma.agent.create({ data: { id: "agent_1", name: "Builder", harness: "automomo-daemon", runtimeId: "runtime_1", workspaceId: "workspace_1" } })
      await prisma.agentRun.create({ data: { id: "run_1", roomId: "room_1", agentId: "agent_1", runtimeId: "runtime_1", prompt: "Build it", sourceMessageId: "msg_1" } })
      const registration = await registerDaemon(jsonRequest("/api/daemon/register", { runtimeId: "runtime_1", name: "Local daemon", provider: "pi", environment: { workspaceRoot: "/repo" } }))
      const identity = await registration.json()
      const leaseBody = { runtimeId: "runtime_1" }
      const leaseResponse = await claimLease(jsonRequest("/api/daemon/lease", leaseBody, signedHeaders("/api/daemon/lease", leaseBody, { daemonId: identity.daemon.id, runtimeId: "runtime_1", secret: identity.secret })))
      const leasePayload = await leaseResponse.json()
      const outcomeBody = { runtimeId: "runtime_1", leaseId: leasePayload.lease.leaseId, runId: "run_1", content: "Done", outcome: { status: "success", summary: "Done", result: {} }, sessionUrl: null }
      const response = await uploadOutcome(jsonRequest("/api/daemon/outcome", outcomeBody, signedHeaders("/api/daemon/outcome", outcomeBody, { daemonId: identity.daemon.id, runtimeId: "runtime_1", secret: identity.secret })))
      expect(response.status).toBe(200)
      const message = await prisma.message.findUnique({ where: { id: "run_1" } })
      expect(message?.content).toBe("Done")
      expect(message?.authorId).toBe("agent_1")
    }))
  })
  ```

- [ ] Step 3: Implement lease claim.

  `POST /api/daemon/lease`:

  - Requires signed daemon request.
  - Finds oldest `AgentRun` with `status = "queued"` and matching `runtimeId`.
  - Uses an update transaction so only one daemon claims the run.
  - Creates `AgentRunLease`.
  - Marks run `claimed`.
  - Returns `AgentRunLeaseResponseSchema`.

- [ ] Step 4: Implement renew.

  `POST /api/daemon/lease/renew`:

  - Requires signed daemon request.
  - Validates daemon owns the active lease.
  - Extends `expiresAt`.
  - Updates `renewedAt`.

- [ ] Step 5: Implement events.

  `POST /api/daemon/events`:

  - Requires signed daemon request.
  - Validates active lease.
  - Stores concise event metadata in `AgentRun.metadataJson`.
  - Broadcasts `room` event through Oz SSE.

- [ ] Step 6: Implement outcome.

  `POST /api/daemon/outcome`:

  - Requires signed daemon request.
  - Validates active lease.
  - Calls `completeAgentRun({ source: "automomo-daemon" })`.
  - Marks lease completed.
  - Returns created message and run.

- [ ] Step 7: Implement fail.

  `POST /api/daemon/fail`:

  - Requires signed daemon request.
  - Validates active lease.
  - Marks run failed.
  - Creates room-visible error message from the agent.
  - Marks orchestration child failed if applicable.
  - Broadcasts room update.

- [ ] Step 8: Verify.

  Run:

  ```bash
  pnpm --filter @automomo/web test -- daemon-lease
  pnpm --filter @automomo/web typecheck
  ```

  Expected: pass.

- [ ] Step 9: Commit.

  ```bash
  git commit -m "feat: add oz local daemon lease routes"
  ```

### Task 8: Adapt The Automomo Daemon To AgentRun Leases

**Files:**

- Modify: `apps/daemon/src/client.ts`
- Modify: `apps/daemon/src/worker.ts`
- Modify: `apps/daemon/src/config.ts`
- Modify: `apps/daemon/test/worker.test.ts`
- Modify: `apps/daemon/test/local-runtime.e2e.test.ts`

**Goal:** Make the existing daemon run Oz `AgentRun` leases instead of old WorkItem/Session leases.
**Criteria:** Daemon registers, claims an Oz local run, executes Pi runtime, and uploads a room response.

- [ ] Step 1: Update daemon client response parsing.

  Replace old `LeaseResponseSchema` usage with `AgentRunLeaseResponseSchema`.

- [ ] Step 2: Update worker runtime context.

  Map lease data into Pi runtime context:

  ```ts
  {
    session: {
      id: lease.run.id,
      codebaseId: lease.runtime.id,
      roomId: lease.run.roomId,
      agentId: lease.run.agentId,
      runtimeId: lease.runtime.id,
      status: "running",
      participants: [{ type: "agent", id: lease.agent.id, name: lease.agent.name }],
      metadata: {
        room: lease.room,
        context: lease.context,
        sourceMessageId: lease.run.sourceMessageId,
        depth: lease.run.depth
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    runtime,
    agent,
    workItem: {
      id: lease.run.id,
      codebaseId: lease.runtime.id,
      roomId: lease.run.roomId,
      title: `Room request for ${lease.agent.name}`,
      body: lease.run.prompt,
      source: "manual",
      status: "running",
      priority: "medium",
      labels: ["room-run"],
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }
  ```

- [ ] Step 3: Update outcome upload.

  `uploadOutcome` should send:

  ```ts
  {
    runtimeId,
    leaseId,
    runId: lease.run.id,
    content: result.outcome.summary,
    outcome: result.outcome,
    sessionUrl: null
  }
  ```

- [ ] Step 4: Update daemon tests.

  Worker test expected call sequence remains:

  ```ts
  ["heartbeat", "renew", "events", "outcome"]
  ```

  The claimed lease now contains `run`, `room`, `agent`, `runtime`, and `context`.

- [ ] Step 5: Verify.

  Run:

  ```bash
  pnpm --filter @automomo/daemon test
  pnpm --filter @automomo/daemon typecheck
  ```

  Expected: pass.

- [ ] Step 6: Commit.

  ```bash
  git commit -m "feat: adapt daemon to oz agent run leases"
  ```

### Task 9: Pi Prompt For Room Workspace

**Files:**

- Modify: `packages/pi-runtime/src/index.ts`
- Modify: `packages/pi-runtime/test/adapter.test.ts`

**Goal:** Make local runtime prompts look like Oz agent prompts: identity, room, history, teammates, task board, callback expectation, and user request.
**Criteria:** Pi prompt includes room context and recent chat without leaking secrets.

- [ ] Step 1: Add test expectations.

  In `packages/pi-runtime/test/adapter.test.ts`, add:

  ```ts
  it("composes a room workspace prompt from Oz run metadata", () => {
    const prompt = composePiPrompt({
      session: {
        id: "run_1",
        codebaseId: "runtime_1",
        roomId: "room_1",
        agentId: "agent_1",
        runtimeId: "runtime_1",
        status: "running",
        participants: [],
        metadata: {
          room: { id: "room_1", name: "Build Room", description: "Implement automomo" },
          context: [{ authorName: "Human", content: "@Builder review this", authorType: "human" }]
        },
        createdAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z"
      },
      runtime: {
        id: "runtime_1",
        name: "Local Runtime",
        mode: "remote_daemon",
        provider: "pi",
        environment: { workspaceRoot: "/repo", networkPolicy: "restricted", env: {}, secretRefs: [] },
        status: "online",
        capacity: 1,
        activeSessions: 0,
        metadata: {},
        createdAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z"
      },
      agent: {
        id: "agent_1",
        name: "Builder",
        model: "pi",
        instructions: "Write code carefully.",
        skills: [],
        defaultRuntimeId: "runtime_1",
        metadata: {},
        createdAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z"
      },
      workItem: {
        id: "run_1",
        codebaseId: "runtime_1",
        roomId: "room_1",
        title: "Room request",
        body: "@Builder review this",
        source: "manual",
        status: "running",
        priority: "medium",
        labels: [],
        metadata: {},
        createdAt: "2026-04-22T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z"
      }
    })

    expect(prompt).toContain("Room: Build Room")
    expect(prompt).toContain("Implement automomo")
    expect(prompt).toContain("Human: @Builder review this")
    expect(prompt).toContain("Write code carefully.")
  })
  ```

- [ ] Step 2: Implement prompt changes.

  `composePiPrompt()` should include:

  - identity
  - agent instructions
  - room name and description
  - workspace root
  - recent chat context
  - user request
  - structured JSON response requirement

- [ ] Step 3: Verify.

  Run:

  ```bash
  pnpm --filter @automomo/pi-runtime test
  pnpm --filter @automomo/pi-runtime typecheck
  ```

  Expected: pass.

- [ ] Step 4: Commit.

  ```bash
  git commit -m "feat: compose pi prompts for oz rooms"
  ```

### Task 10: Mention Dispatch Uses Local Harness By Default

**Files:**

- Modify: `apps/web/app/api/messages/route.ts`
- Modify: `apps/web/lib/mention-dispatch.ts`
- Modify: `apps/web/app/api/agents/route.ts`
- Test: `apps/web/test/mention-dispatch.test.ts`

**Goal:** Human `@agent` messages should queue local daemon runs for automomo agents.
**Criteria:** A room message mentioning two local agents creates two queued `AgentRun`s, and an agent response mentioning two local agents creates one orchestration.

- [ ] Step 1: Update agent creation default.

  New agents default to:

  ```ts
  {
    harness: "automomo-daemon",
    runtimeId: selectedRuntimeId,
    environmentId: ""
  }
  ```

- [ ] Step 2: Update mention target grouping.

  `getMentionDispatchTargets()` should return:

  ```ts
  {
    mentionedAgents,
    ozAgents,
    daemonAgents
  }
  ```

  The old `openClawAgents` path is removed or aliased to `daemonAgents`.

- [ ] Step 3: Update `POST /api/messages`.

  Human messages:

  - create the message
  - broadcast the message
  - resolve mentions
  - set mentioned local agents to running
  - dispatch through `invokeAgent()` in `after()`

- [ ] Step 4: Verify recursive agent messages.

  Agent response mentions should still dispatch through `completeAgentRun()`.

- [ ] Step 5: Add tests.

  Test cases:

  - no mention creates no `AgentRun`
  - one local mention creates one `AgentRun`
  - two local mentions create two `AgentRun`s
  - a non-room agent mention creates no run
  - repeated mention creates one run

- [ ] Step 6: Verify.

  Run:

  ```bash
  pnpm --filter @automomo/web test -- mention-dispatch
  pnpm --filter @automomo/web typecheck
  ```

  Expected: pass.

- [ ] Step 7: Commit.

  ```bash
  git commit -m "feat: dispatch room mentions to local daemon runs"
  ```

### Task 11: Fan-Out/Fan-In With Local Runs

**Files:**

- Modify: `apps/web/app/api/agent-response/route.ts`
- Modify: `apps/web/lib/agent-run-completion.ts`
- Modify: `apps/web/lib/invoke-agent.ts`
- Test: `apps/web/test/local-fan-in.test.ts`

**Goal:** Oz fan-in should work when children and the lead are local daemon runs.
**Criteria:** A lead response mentioning two agents creates an orchestration, both children complete, and the lead follow-up run is queued exactly once.

- [ ] Step 1: Write fan-in test.

  Cases:

  - lead message with two mentions creates `AgentOrchestration`
  - each child gets `AgentOrchestrationChild.runId = AgentRun.id`
  - first child completion marks only that child completed
  - second child completion marks orchestration completed and queues follow-up lead run
  - repeated second completion does not create another lead follow-up

- [ ] Step 2: Ensure child creation uses local run ids.

  When local harness dispatches child runs, create child rows with the same `runId` returned by the harness.

- [ ] Step 3: Preserve Oz callback compatibility.

  `AgentOrchestrationChild.runId` remains generic. It can point to:

  - Oz invocation id
  - automomo local `AgentRun.id`

- [ ] Step 4: Verify.

  Run:

  ```bash
  pnpm --filter @automomo/web test -- local-fan-in
  pnpm --filter @automomo/web typecheck
  ```

  Expected: pass.

- [ ] Step 5: Commit.

  ```bash
  git commit -m "feat: support fan-in for local daemon runs"
  ```

### Task 12: SSE And Room UX Parity

**Files:**

- Modify: `apps/web/app/api/events/route.ts`
- Modify: `apps/web/lib/event-broadcaster.ts`
- Modify: `apps/web/hooks/use-realtime.ts`
- Modify: `apps/web/components/chat-stream.tsx`
- Modify: `apps/web/components/kanban-board.tsx`
- Test: `apps/web/test/realtime.test.ts`

**Goal:** Preserve Oz's realtime room UX while adding local run status updates.
**Criteria:** Chat, task board, agent status, artifacts, and local run completions update without reload.

- [ ] Step 1: Add local run event type.

  Extend:

  ```ts
  export type EventType = "message" | "room" | "task" | "agent" | "notification" | "artifact" | "run"
  ```

- [ ] Step 2: Broadcast run events.

  Emit `run` when:

  - local run queued
  - local run claimed
  - local run completed
  - local run failed

- [ ] Step 3: Handle run events in `use-realtime.ts`.

  On `run`, call `refreshRoom(roomId)` and `fetchTasks(roomId)`.

- [ ] Step 4: Keep chat simple.

  The room chat remains Slack-like:

  - avatar
  - author
  - time
  - Markdown body
  - session/run link when available
  - no dashboard-style cards inside the chat stream

- [ ] Step 5: Verify.

  Run:

  ```bash
  pnpm --filter @automomo/web test -- realtime
  pnpm --filter @automomo/web typecheck
  ```

  Expected: pass.

- [ ] Step 6: Commit.

  ```bash
  git commit -m "feat: stream local run updates to rooms"
  ```

### Task 13: End-To-End Local Runtime Flow

**Files:**

- Create: `apps/web/test/local-runtime.e2e.test.ts`
- Modify: `apps/daemon/test/local-runtime.e2e.test.ts`
- Modify: `README.md`

**Goal:** Prove the Oz-first app can use this repo as a local runtime and show the result in room chat.
**Criteria:** A room mention runs through local daemon, Pi runtime, daemon outcome, room message, and SSE-visible state.

- [ ] Step 1: Create e2e fixture.

  The test should:

  - create workspace
  - create user
  - create room
  - create runtime with `workspaceRoot` set to `/Users/randomradio/src/mo/automomo`
  - create daemon
  - create two agents with `harness = "automomo-daemon"` and `runtimeId`
  - join agents to room
  - post room message mentioning one agent
  - run `DaemonWorker.pollOnce()`
  - assert agent message appears

- [ ] Step 2: Verify room message content.

  Assert final message:

  - has `authorType = "agent"`
  - has `authorId = mentioned agent id`
  - uses the local run id as message id
  - contains the Pi outcome summary

- [ ] Step 3: Verify no source upload.

  Assert daemon result payload only uploads:

  - events
  - outcome summary
  - structured result

  It must not upload repository file contents.

- [ ] Step 4: Update README run instructions.

  Add:

  ```bash
  pnpm install
  pnpm --filter @automomo/web db:push
  pnpm --filter @automomo/web dev
  pnpm --filter @automomo/daemon dev -- --base-url http://localhost:3000
  ```

- [ ] Step 5: Verify.

  Run:

  ```bash
  pnpm --filter @automomo/web test -- local-runtime.e2e
  pnpm --filter @automomo/daemon test -- local-runtime.e2e
  pnpm test
  ```

  Expected: pass.

- [ ] Step 6: Commit.

  ```bash
  git commit -m "test: validate oz local runtime flow"
  ```

### Task 14: Legacy Control Plane Retirement

**Files:**

- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Delete or archive: `apps/api`
- Modify: `docs/plans/2026-04-20-automomo-platform-plan.md`
- Modify: `README.md`

**Goal:** Remove the old dashboard/control-plane implementation after the Oz-first app owns runtime execution.
**Criteria:** Root scripts run only the Oz-derived app and local daemon. No active docs describe Auto-Mobile or the old WorkItem/Session product as the primary app.

- [ ] Step 1: Confirm replacement tests pass.

  Run:

  ```bash
  pnpm test
  pnpm typecheck
  pnpm --filter @automomo/web build
  ```

  Expected: pass.

- [ ] Step 2: Remove `apps/api` from workspace if no package depends on it.

  Update `pnpm-workspace.yaml` only if the app is deleted rather than archived.

- [ ] Step 3: Update root scripts.

  Root `package.json`:

  ```json
  {
    "scripts": {
      "build": "pnpm -r build",
      "dev": "pnpm --filter @automomo/web dev",
      "dev:daemon": "pnpm --filter @automomo/daemon dev",
      "lint": "pnpm -r lint",
      "test": "pnpm -r test",
      "typecheck": "pnpm -r typecheck"
    }
  }
  ```

- [ ] Step 4: Update docs.

  README should say:

  - automomo is a room-first multi-agent workspace
  - humans and agents work together in rooms
  - local daemon provides runtime execution
  - no source code is uploaded by default
  - local machine can be the runtime

- [ ] Step 5: Verify.

  Run:

  ```bash
  pnpm install
  pnpm test
  pnpm typecheck
  ```

  Expected: pass.

- [ ] Step 6: Commit.

  ```bash
  git commit -m "chore: retire legacy control plane"
  ```

## Validation Matrix

Required automated checks:

```bash
pnpm --filter @automomo/web db:generate
pnpm --filter @automomo/web test
pnpm --filter @automomo/web typecheck
pnpm --filter @automomo/pi-runtime test
pnpm --filter @automomo/pi-runtime typecheck
pnpm --filter @automomo/daemon test
pnpm --filter @automomo/daemon typecheck
pnpm test
pnpm typecheck
```

Required manual/browser checks:

- Open `http://localhost:3000`.
- Sign up or use seeded account.
- Create a runtime with this repo as `workspaceRoot`.
- Start daemon against `http://localhost:3000`.
- Create two local daemon agents on the same runtime.
- Create a room and add both agents.
- Send a plain chat message and verify no run is created.
- Send `@AgentName inspect this repo and report what changed`.
- Verify the agent enters running state.
- Verify the daemon claims the run.
- Verify an agent message appears in chat.
- Verify the task board remains room scoped.
- Verify a two-agent mention creates fan-out and a fan-in lead follow-up.

## Self-Review

Spec coverage:

- Oz-first product model: covered by Tasks 1, 10, 11, and 12.
- Local daemon runtime: covered by Tasks 5, 6, 8, 9, and 13.
- Fan-out/fan-in: covered by Tasks 4, 10, and 11.
- Room chat and SSE: covered by Tasks 1, 4, 10, and 12.
- Current repo as runtime: covered by Task 13.
- Legacy control plane removal: covered by Task 14.

Dependency order:

- Oz import must happen before harness work.
- Runtime schema must happen before daemon routes.
- Completion service must happen before daemon outcome and fan-in.
- Daemon adaptation must happen after daemon routes and protocol schemas.
- Legacy cleanup only happens after e2e validation.

Risk controls:

- Keep one commit per task.
- Do not delete `apps/api` until all Oz-first local runtime tests pass.
- Do not copy Oz `.env.local`, `node_modules`, `.git`, captures, or `prisma/dev.db`.
- Do not upload source files through daemon outcome payloads.
- Keep Redis optional; local in-memory SSE is enough for MVP.

Open implementation defaults:

- Default local agent harness is `automomo-daemon`.
- A runtime can be shared by many agents through `Agent.runtimeId`.
- `AgentRun.id` is the local run id used by orchestration children and message upserts.
- Oz `Task` is the room kanban unit in the Oz-first app.
- Automomo WorkItem/Session remain legacy concepts until `apps/api` is removed.
