# automomo Platform Implementation Plan

Date: 2026-04-20
Status: Active - reviewed 2026-04-20

## Problem Frame

`automomo` is a multi-agent work orchestration system for codebases. Humans and AI agents should be able to co-work on the same runtime, inspect the same codebase context, hand work back and forth, and preserve shared session state.

GitHub can be one source of work items, but the product model is source-neutral:

```text
Human intent or external event
  -> work item
  -> orchestration rule or manual assignment
  -> shared runtime for a codebase
  -> human and agents collaborate
  -> session events and structured outcome are saved
```

The UI should feel like a compact codebase operations workspace, inspired by Programa's dense rail/table language:

```text
Overview -> Work Items -> Orchestration -> Sessions -> Agents -> Runtimes
```

## Decisions

- Call the product `automomo`.
- Focus the product on multi-agent orchestration plus human intervention.
- Humans and AI agents co-work on a runtime for a codebase.
- Runtime means reusable code plus environment.
- Pi Mono is the primary agent runtime.
- The MVP product is TypeScript-first.
- The daemon MVP is TypeScript.
- A small Go daemon binary can be added later as a hardened connector.
- Remote runtime connectivity starts with outbound HTTP polling and leases.
- Remote sessions upload structured outcomes and event metadata by default.

## Review Snapshot: 2026-04-20

The first implementation pass has moved beyond the original static prototype. The repo now has the TypeScript monorepo shape, protocol schemas, a SQLite-backed API control plane, a TypeScript daemon lease loop, a metadata-only Pi runtime adapter, a Programa-inspired web shell, architecture docs, and an end-to-end local-machine runtime test that uses this repo as the example workspace.

Completed or mostly completed:

- Repo foundation for `apps/web`, `apps/api`, `apps/daemon`, `packages/protocol`, and `packages/pi-runtime`.
- Static Programa prototype preserved under `docs/prototypes/programa-static`.
- Automomo vocabulary established in README, architecture docs, routes, schemas, and UI copy.
- Shared protocol schemas for codebases, work items, orchestration rules, sessions, events, agents, runtimes, outcomes, handoffs, daemon registration, heartbeats, leases, event uploads, and outcome uploads.
- API list/create and session/event/daemon endpoints backed by the default SQLite store.
- Basic web navigation for Overview, Work Items, Orchestration, Sessions, Agents, and Runtimes using mock data.
- TypeScript daemon worker that registers/heartbeats, polls leases, emits events, and uploads outcomes.
- Local runtime e2e coverage proving the daemon/control-plane flow against this repository.

Persistent todos created from this review:

- `#001` Wire the web UI to live API data and add the Overview endpoint.
- `#002` Add work item and session filtering contracts.
- `#003` Implement orchestration rule evaluation and automatic session starts.
- `#004` Complete session detail, outcome, and human handoff flows.
- `#005` Harden the daemon lease protocol and CLI operations.
- `#006` Replace the Pi runtime stub with a real Pi Mono execution adapter.
- `#007` Add connector-neutral work item ingress and GitHub fresh-context upsert.
- `#008` Implement co-located local runtime execution in the API.
- `#009` Add editor workflows and health surfaces for rules, agents, and runtimes.
- `#010` Add security and operations hardening before real codebase use.
- `#011` Defer the Go daemon and BoxLite/VM runtime until the TypeScript runtime path stabilizes.

Review notes:

- The implementation currently uses singular daemon endpoints such as `/api/daemon/lease`, while this plan lists plural `/api/daemons/*` endpoints. Decide whether to keep the shipped singular contract, add aliases, or rename before external daemon clients depend on it.
- The protocol schemas are consolidated in `packages/protocol/src/index.ts` instead of split per-domain files. Split only if the file becomes a maintenance problem.
- The Pi runtime adapter currently proves session metadata translation, not real Pi Mono coding-agent execution.
- The local-machine e2e test proves remote-daemon lease flow, not the co-located API runtime provider from Phase 8.

## Architecture Target

```text
apps/web
  Next.js UI for Overview, Work Items, Orchestration, Sessions, Agents, Runtimes

apps/api
  TypeScript control plane for codebases, work items, rules, sessions, agents, runtimes, daemon leases

apps/daemon
  TypeScript user-run daemon for remote runtimes

cmd/automomo-daemon
  Optional small Go daemon binary for users who need a hardened connector

packages/protocol
  Shared TypeScript/Zod schemas for API, daemon leases, session events, and outcomes

packages/pi-runtime
  Pi Mono integration for coding/collaboration sessions

docs
  Architecture, plans, decisions, product specs
```

## Runtime And Daemon Choice

Pi Mono is a TypeScript AI agent toolkit and coding-agent runtime. It includes `@mariozechner/pi-agent-core`, `@mariozechner/pi-coding-agent`, a unified LLM API, TUI/web UI packages, Slack bot support, vLLM pod tooling, JSON/RPC modes, SDK embedding, skills, extensions, sessions, and event streams.

There are four layers:

1. **Control plane**: hosted API, work items, orchestration rules, sessions, runtime leases, codebase state.
2. **Daemon**: user-run process that polls for work, prepares local/VM/container runtime access, and reports outcomes.
3. **Agent runtime**: Pi Mono, Codex CLI, Claude Code, OpenCode, or another provider that performs coding/collaboration work.
4. **Agent behavior**: prompts, skills, tools, orchestration rules, outcome schemas, and judgment.

The MVP should not pay an upfront cross-language tax. TypeScript is the natural center because the UI, protocol schemas, and Pi Mono runtime are all TypeScript-native.

Default MVP recommendation:

```text
Control plane: TypeScript
Remote daemon MVP: TypeScript
Primary agent runtime: Pi Mono
Optional hardened connector: small Go binary
Other possible agent runtimes: Codex CLI, Claude Code, OpenCode
```

The optional Go daemon should stay intentionally small:

- Pair/register with the platform.
- Poll and lease sessions.
- Launch the configured local runtime command.
- Push session events and final structured outcomes.
- Heartbeat and report health.

It should not own orchestration rules, prompt composition, outcome schemas, UI logic, or product policy.

## Core Product Concepts

### Codebase

A repository or workspace that humans and agents work on. GitHub can be one provider, but the model should not assume GitHub-only inputs.

### Work Item

A unit of intent or work. Examples:

- "Investigate this failing test."
- "Implement this GitHub issue."
- "Assess this pull request."
- "Refactor this module."
- "Run migration safety checks."
- "Human wants to pair with an agent in this runtime."

### Orchestration Rule

A durable rule that decides when and how work should be routed.

```text
OrchestrationRule
  id
  codebaseId
  name
  enabled
  trigger: manual | webhook | schedule | sync | api
  match
  agentId
  runtimeId
  humanApproval
  createdAt
  updatedAt
```

### Session

A collaborative execution record. A session can be agent-only, human-only, or human plus agents.

```text
Session
  id
  workItemId
  codebaseId
  status
  participants: humans + agents
  runtimeId
  events
  outcome
  createdAt
  updatedAt
```

### Runtime

Reusable code plus environment.

```text
Runtime
  id
  name
  mode: hosted | remote_daemon | local
  provider: pi | docker | boxlite | shell
  code:
    image
    command
    installedTooling
    skillMounts
  environment:
    workspaceRoot
    memoryMB
    cpus
    networkPolicy
    env
    secretRefs
  status
  lastHeartbeatAt
```

### Agent

Instructions plus tools plus default runtime.

```text
Agent
  id
  name
  model
  instructions
  skills
  tools
  defaultRuntimeId
```

## Phase 0: Repo Foundation

Goal: turn `automomo` from static prototype into a product repo.

Files:

- `README.md`
- `docs/architecture/overview.md`
- `docs/architecture/runtime-decision.md`
- `docs/plans/2026-04-20-automomo-platform-plan.md`
- `docs/prototypes/programa-static/`
- `apps/web/`
- `apps/api/`
- `apps/daemon/`
- `cmd/automomo-daemon/`
- `packages/protocol/`
- `packages/pi-runtime/`

Tasks:

1. Create repo layout.
2. Move current static prototype into `docs/prototypes/programa-static/`.
3. Add architecture overview for multi-agent codebase orchestration.
4. Add runtime decision record for TypeScript-first product, Pi Mono runtime, and optional Go daemon.
5. Update README to describe automomo accurately.

Acceptance:

- No docs use the old placeholder name.
- No docs frame automomo as only GitHub issue/PR work.
- Prototype remains accessible.
- Repo structure communicates UI, API, daemon, protocol, runtime, and docs boundaries.

## Phase 1: UI Shell And Vocabulary

Goal: build the automomo UI shell before deep backend work.

Routes:

- `/` Overview
- `/work-items`
- `/orchestration`
- `/sessions`
- `/agents`
- `/runtimes`
- `/settings`

Tasks:

1. Convert the Programa-inspired static shell into a reusable app shell.
2. Replace borrowed prototype labels with automomo language.
3. Add left rail sections: Workspace, Work Items, Orchestration, Sessions, Agents, Runtimes.
4. Add top strip for runtime health, daemon count, active sessions, and human handoff state.
5. Add empty/loading/error states for each route.
6. Add responsive behavior for mobile rail and dense tables.

Implementation units:

- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/work-items/page.tsx`
- `apps/web/src/app/orchestration/page.tsx`
- `apps/web/src/app/sessions/page.tsx`
- `apps/web/src/app/agents/page.tsx`
- `apps/web/src/app/runtimes/page.tsx`
- `apps/web/src/components/AppShell.tsx`
- `apps/web/src/components/WorkspaceRail.tsx`
- `apps/web/src/components/StatusStrip.tsx`
- `apps/web/src/styles/tokens.css`

Tests:

- `apps/web/src/components/AppShell.test.tsx`
- `apps/web/tests/smoke.spec.ts`

Scenarios:

- Desktop shell shows rail, status strip, top actions, and active route.
- Mobile shell collapses rail without hiding primary content.
- Long codebase/work-item names do not overflow action columns.
- Empty states communicate whether the system is waiting for human input, agent output, or runtime availability.

## Phase 2: Protocol And API Contracts

Goal: define contracts that match the product model.

Contracts:

```text
GET /api/overview
GET /api/codebases
GET /api/work-items
GET /api/orchestration-rules
GET /api/sessions
GET /api/agents
GET /api/runtimes
```

Tasks:

1. Define shared Zod schemas in `packages/protocol`.
2. Add mock adapters for UI development.
3. Add API skeleton with health and overview endpoints.
4. Add work-item filtering contract: codebase, source, status, assignee, q, limit, offset.
5. Add session filtering contract: status, codebase, agent, runtime, participant, date range.

Implementation units:

- `packages/protocol/src/overview.ts`
- `packages/protocol/src/codebases.ts`
- `packages/protocol/src/work-items.ts`
- `packages/protocol/src/orchestration-rules.ts`
- `packages/protocol/src/sessions.ts`
- `packages/protocol/src/runtimes.ts`
- `apps/web/src/lib/api.ts`
- `apps/api/src/http/overview.ts`
- `apps/api/src/http/work-items.ts`
- `apps/api/src/http/sessions.ts`

Tests:

- `packages/protocol/src/*.test.ts`
- `apps/api/src/http/overview.test.ts`
- `apps/api/src/http/work-items.test.ts`
- `apps/web/src/lib/api.test.ts`

Scenarios:

- UI can render Overview from one payload.
- Work Items page renders cross-codebase rows without extra calls.
- Session rows include enough data to explain participants, runtime, and status.
- Schema validation rejects unknown enum values.

## Phase 3: Orchestration Rule Model

Goal: orchestration rules become the first-class durable routing model.

Tasks:

1. Add orchestration rule schema and storage.
2. Build rule list/detail UI.
3. Add rule create/edit/enable/disable flows.
4. Implement rule evaluator for work items.
5. Support manual rules, webhook/API rules, sync rules, and schedule rules.

Implementation units:

- `packages/protocol/src/orchestration-rules.ts`
- `apps/api/src/model/orchestration-rule.ts`
- `apps/api/src/store/orchestration-rules.ts`
- `apps/api/src/orchestration/evaluator.ts`
- `apps/api/src/http/orchestration-rules.ts`
- `apps/web/src/app/orchestration/page.tsx`
- `apps/web/src/components/OrchestrationRuleTable.tsx`
- `apps/web/src/components/OrchestrationRuleEditor.tsx`

Tests:

- `apps/api/src/orchestration/evaluator.test.ts`
- `apps/api/src/store/orchestration-rules.test.ts`
- `apps/api/src/http/orchestration-rules.test.ts`
- `apps/web/src/components/OrchestrationRuleEditor.test.tsx`

Scenarios:

- A rule can route a manual work item to an agent/runtime.
- A rule can require human approval before an agent starts.
- Disabled rules never start sessions.
- Scheduled rules compute next run.
- UI can explain why a work item matched a rule.

## Phase 4: Work Item Ingress

Goal: external events and human intent both create fresh, context-rich work items.

Sources:

- Manual UI entry.
- API call.
- GitHub webhook.
- Future connectors such as Slack, Linear, email, or local CLI.

Tasks:

1. Add connector-neutral work-item creation.
2. Add GitHub connector as one source.
3. Fetch fresh source context for external events.
4. Upsert work item from source context.
5. Evaluate orchestration rules and start sessions when appropriate.
6. Keep manual creation and webhook/API creation on the same path.

Implementation units:

- `apps/api/src/connectors/github/client.ts`
- `apps/api/src/http/webhooks/github.ts`
- `apps/api/src/http/work-items.ts`
- `apps/api/src/work-items/upsert.ts`
- `apps/api/src/sessions/start.ts`

Tests:

- `apps/api/src/http/webhooks/github.test.ts`
- `apps/api/src/work-items/upsert.test.ts`
- `apps/api/src/sessions/start.test.ts`

Scenarios:

- Manual work item starts a session when a rule matches.
- GitHub issue event fetches fresh context and creates a work item.
- GitHub pull request event is represented as a work item, not as the whole product model.
- Duplicate events dedupe active sessions.
- Unknown codebase is rejected clearly.

## Phase 5: Sessions And Outcomes

Goal: sessions become the central operational record for human/agent co-work.

Tasks:

1. Add session model with resolved work item, participants, agent, and runtime.
2. Store session events as timeline entries.
3. Store structured outcome only by default.
4. Add human handoff events: pause, request input, resume, approve, reject.
5. Build Sessions UI with filters and detail panel.

Implementation units:

- `packages/protocol/src/sessions.ts`
- `apps/api/src/model/session.ts`
- `apps/api/src/store/sessions.ts`
- `apps/api/src/http/sessions.ts`
- `apps/api/src/outcomes/outcomes.ts`
- `apps/web/src/app/sessions/page.tsx`
- `apps/web/src/components/SessionTable.tsx`
- `apps/web/src/components/SessionDetailPanel.tsx`

Tests:

- `apps/api/src/store/sessions.test.ts`
- `apps/api/src/http/sessions.test.ts`
- `apps/api/src/outcomes/outcomes.test.ts`
- `apps/web/src/components/SessionTable.test.tsx`

Scenarios:

- Session records persist resolved agent and runtime.
- Events append in order.
- Human intervention can pause and resume a session.
- Final outcome updates work-item state.
- Failed sessions preserve error and event history.

## Phase 6: Runtime Model

Goal: runtime means reusable code plus environment.

Tasks:

1. Add runtime schema and storage.
2. Build Runtimes UI.
3. Add Pi Mono runtime as the default coding/collaboration runtime.
4. Add local Docker runtime option.
5. Add runtime selection to agent and orchestration rule forms.
6. Persist resolved runtime on sessions.

Implementation units:

- `packages/protocol/src/runtimes.ts`
- `apps/api/src/model/runtime.ts`
- `apps/api/src/store/runtimes.ts`
- `apps/api/src/http/runtimes.ts`
- `apps/web/src/app/runtimes/page.tsx`
- `apps/web/src/components/RuntimeTable.tsx`
- `apps/web/src/components/RuntimeEditor.tsx`

Tests:

- `apps/api/src/store/runtimes.test.ts`
- `apps/api/src/http/runtimes.test.ts`
- `apps/web/src/components/RuntimeEditor.test.tsx`

Scenarios:

- Pi Mono runtime is available after setup.
- Many agents can reference one runtime.
- Orchestration rule can override an agent default runtime.
- Runtime health appears in Overview and Runtimes.

## Phase 7: Pi Mono Runtime Integration

Goal: make Pi Mono the primary agent runtime for coding/collaboration sessions.

Tasks:

1. Define `pi` as a runtime provider.
2. Create Pi runtime package/config with `@mariozechner/pi-coding-agent`.
3. Add adapter for Pi JSON/RPC or SDK mode.
4. Map automomo session prompts/outcome schemas to Pi sessions.
5. Capture Pi event stream into automomo session events.
6. Load codebase `AGENTS.md`, automomo orchestration context, selected tools, and selected skills into the Pi session.

Implementation units:

- `packages/pi-runtime/README.md`
- `packages/pi-runtime/src/config.ts`
- `packages/pi-runtime/src/adapter.ts`
- `packages/pi-runtime/src/events.ts`
- `packages/pi-runtime/src/outcome.ts`
- `apps/api/src/runtime/pi.ts`
- `packages/protocol/src/pi.ts`

Tests:

- `packages/pi-runtime/src/adapter.test.ts`
- `packages/pi-runtime/src/events.test.ts`
- `packages/pi-runtime/src/outcome.test.ts`
- `apps/api/src/runtime/pi.test.ts`

Scenarios:

- Pi runtime starts in a prepared worktree.
- Pi receives work-item context, orchestration context, and outcome schema.
- Pi events become automomo session events.
- Pi final output decodes into structured session outcome.
- Malformed Pi output becomes a decode failure with event trail.
- Pi packages/extensions are treated as trusted runtime configuration.

## Phase 8: Co-Located Runtime Execution

Goal: run sessions where API and runtime live on one machine.

Tasks:

1. Implement local runtime provider interface.
2. Prepare repo cache and isolated worktree.
3. Create Docker or shell runtime with resource limits.
4. Execute selected agent runtime, including Pi Mono.
5. Capture structured outcome.
6. Cleanup runtime and preserve session history.

Implementation units:

- `apps/api/src/runtime/provider.ts`
- `apps/api/src/runtime/docker.ts`
- `apps/api/src/runtime/shell.ts`
- `apps/api/src/git/workspace.ts`
- `apps/api/src/runtime/codex.ts`
- `apps/api/src/runtime/claude.ts`
- `apps/api/src/runtime/opencode.ts`

Tests:

- `apps/api/src/runtime/docker.test.ts`
- `apps/api/src/runtime/shell.test.ts`
- `apps/api/src/git/workspace.test.ts`

Scenarios:

- Runtime prepares fresh worktree.
- Runtime reuses clean worktree.
- Runtime recovers dirty worktree safely.
- Timeout marks session failed.
- Malformed agent output becomes a decode failure with event trail.

## Phase 9: Remote Daemon MVP

Goal: user can run a TypeScript daemon that polls for sessions and returns structured outcomes.

Protocol:

```text
POST /api/daemons/register
POST /api/daemons/heartbeat
POST /api/daemons/sessions/lease
POST /api/daemons/sessions/{id}/events
POST /api/daemons/sessions/{id}/outcome
POST /api/daemons/sessions/{id}/fail
```

Tasks:

1. Add daemon registration and pairing token.
2. Add daemon identity and signed requests.
3. Add polling lease endpoint.
4. Add lease expiry/reclaim.
5. Add daemon CLI with `start`, `status`, `doctor`.
6. Run one leased session locally and upload events/outcome.

Implementation units:

- `apps/api/src/model/daemon.ts`
- `apps/api/src/http/daemons.ts`
- `apps/api/src/sessions/lease.ts`
- `apps/daemon/src/main.ts`
- `apps/daemon/src/config/config.ts`
- `apps/daemon/src/worker/worker.ts`
- `apps/daemon/src/runtime/local.ts`

Tests:

- `apps/api/src/http/daemons.test.ts`
- `apps/api/src/sessions/lease.test.ts`
- `apps/daemon/src/worker/worker.test.ts`

Scenarios:

- Daemon registers with a pairing token.
- Daemon heartbeats capabilities.
- Daemon leases one session and renews lease during execution.
- Lease expires if daemon disappears.
- Daemon uploads only events and structured outcome.
- Platform rejects daemon outcome for an unleased session.

## Phase 10: Optional Go Daemon Add-On

Goal: provide a small single-binary connector once responsibilities stabilize.

Tasks:

1. Implement the same polling lease protocol in Go.
2. Keep configuration compatible with the TypeScript daemon.
3. Launch configured local runtime command.
4. Push events/outcomes to the TypeScript control plane.
5. Add `doctor` diagnostics.

Implementation units:

- `cmd/automomo-daemon/main.go`
- `cmd/automomo-daemon/internal/config/config.go`
- `cmd/automomo-daemon/internal/worker/worker.go`
- `cmd/automomo-daemon/internal/runtime/local.go`
- `cmd/automomo-daemon/internal/doctor/doctor.go`

Tests:

- `cmd/automomo-daemon/internal/worker/worker_test.go`
- `cmd/automomo-daemon/internal/runtime/local_test.go`

Scenarios:

- Go daemon can lease and complete one session.
- Go daemon uses the same protocol as the TypeScript daemon.
- Go daemon does not implement orchestration logic locally.

## Phase 11: BoxLite / VM Runtime

Goal: support VM-backed runtime as an alternative to Docker/shell.

Tasks:

1. Define BoxLite provider behind same runtime interface.
2. Implement workspace preparation.
3. Implement create/exec/read/write/destroy.
4. Add snapshot/fork support if provider supports it.
5. Expose capability flags in Runtime UI.

Implementation units:

- `apps/api/src/runtime/boxlite.ts`
- `apps/api/src/runtime/capabilities.ts`
- `apps/web/src/components/RuntimeCapabilities.tsx`

Tests:

- `apps/api/src/runtime/boxlite.test.ts`

Scenarios:

- BoxLite runtime advertises snapshot capability.
- Sessions can run in BoxLite when selected.
- UI distinguishes Docker, shell, and VM runtime capabilities.

## Phase 12: Hardening

Goal: make the product safe enough for real codebases.

Tasks:

1. Add codebase-scoped API keys.
2. Add audit log for rule changes, daemon leases, sessions, and human interventions.
3. Add rate limits for webhooks and daemon endpoints.
4. Add secret handling and redaction.
5. Add runtime health checks and daemon `doctor`.
6. Add end-to-end test for work item -> rule -> runtime -> session outcome.

Implementation units:

- `apps/api/src/auth/apikeys.ts`
- `apps/api/src/audit/audit.ts`
- `apps/api/src/security/redact.ts`
- `apps/web/tests/e2e-cowork-session.spec.ts`

Tests:

- `apps/api/src/auth/apikeys.test.ts`
- `apps/api/src/audit/audit.test.ts`
- `apps/api/src/security/redact.test.ts`
- `apps/web/tests/e2e-cowork-session.spec.ts`

Scenarios:

- API key cannot access unscoped codebase.
- Secrets never appear in session events.
- Daemon endpoint rejects unsigned requests.
- E2E flow completes with structured outcome visible in UI.

## First Build Slice

The smallest useful implementation slice is:

1. `apps/web` shell with mock data.
2. `packages/protocol` schemas for overview, codebases, work items, rules, sessions, runtimes.
3. `apps/api` health plus mock-backed overview/work-item/session endpoints.
4. One work-item table and one session table.
5. One runtime table showing Pi Mono, local shell/Docker, and remote daemon placeholder.

This gives us a real product-shaped UI quickly while implementation follows the automomo model instead of inheriting a narrower legacy board shape.
