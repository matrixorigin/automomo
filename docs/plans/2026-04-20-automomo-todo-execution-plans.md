# automomo Todo Execution Plans

**Goal:** Convert the reviewed `.context/todos` backlog into detailed implementation plans that can be executed in dependency order.
**Architecture:** Keep automomo TypeScript-first. Protocol contracts remain the center, the Hono API owns durable state and orchestration decisions, the Next.js web app consumes typed API payloads, the TypeScript daemon performs remote runtime work, and Pi Mono is integrated behind the existing `PiRuntimeRunner` seam.
**Tech Stack:** pnpm workspaces, TypeScript, Zod, Hono, better-sqlite3, Drizzle schema definitions, Vitest, Next.js App Router, React, Pi Mono.

---

## Source And Scope

Input source:

- `.context/todos/001-wire-web-ui-to-live-api-data.md`
- `.context/todos/002-add-work-item-and-session-filtering-contracts.md`
- `.context/todos/003-implement-orchestration-rule-evaluation.md`
- `.context/todos/004-complete-session-detail-outcome-and-handoff-flows.md`
- `.context/todos/005-harden-daemon-lease-protocol-and-cli.md`
- `.context/todos/006-replace-pi-runtime-stub-with-real-pi-mono-adapter.md`
- `.context/todos/007-add-work-item-ingress-and-github-fresh-context-upsert.md`
- `.context/todos/008-implement-co-located-local-runtime-execution.md`
- `.context/todos/009-add-editor-workflows-and-health-surfaces.md`
- `.context/todos/010-add-security-and-operations-hardening.md`
- `.context/todos/011-defer-go-daemon-and-boxlite-runtime.md`

Complexity: large. The backlog spans protocol, persistence, HTTP contracts, UI data flow, daemon security, runtime execution, connector ingress, and product hardening. Execute as sequenced slices rather than one branch.

## Research Summary

Local implementation patterns:

- API routes live in `apps/api/src/app.ts`, currently as a single Hono app factory with injectable `store` and `now`.
- Store behavior is expressed by `ControlPlaneStore` in `apps/api/src/store.ts`, with matching `MemoryStore` and `SQLiteStore` implementations.
- SQLite persistence uses inline `ensureSchema()` DDL plus Drizzle table definitions in `apps/api/src/schema.ts`; no migration tool is configured yet.
- API tests use `app.request()` and a small `json()` helper in `apps/api/test/app.test.ts`.
- Daemon tests use faked clients for unit behavior and an in-process Hono app for e2e behavior.
- Web pages are server components using mock data from `apps/web/src/lib/mock-data.ts`; component tests use `renderToStaticMarkup`.
- The UI language is dense and Programa-inspired: light rail, white canvas, thin separators, compact rows, small controls, black primary actions, yellow runtime/handoff accents.
- `packages/pi-runtime` already exposes `PiRuntimeRunner`, so real Pi Mono execution can replace `MetadataOnlyPiRunner` without changing `DaemonWorker`.

Framework notes:

- Hono's official testing guide supports creating `Request` objects and passing them to `app.request`, which matches the current tests.
- Next.js App Router data fetching is comfortable in async Server Components; `loading.js` and Suspense are the intended route-level loading tools.
- Drizzle limit/offset guidance stresses stable ordering by unique columns; use `createdAt` plus `id` for list endpoints.
- Pi Mono's SDK exposes `createAgentSession`, `SessionManager`, `DefaultResourceLoader`, event subscriptions, cwd-aware tool factories, skills overrides, context-file overrides, and RPC mode. Use SDK mode first inside `packages/pi-runtime`; keep RPC mode as a later isolation option.

Sources consulted:

- Hono testing guide: https://www.honojs.com/docs/guides/testing
- Next.js fetching data guide: https://nextjs.org/docs/app/getting-started/fetching-data
- Drizzle limit/offset pagination guide: https://orm.drizzle.team/docs/guides/limit-offset-pagination
- Pi Mono SDK docs: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md

## Execution Order

1. `#002` Filtering contracts.
2. `#001` Live UI API data and overview.
3. `#003` Orchestration evaluation and session starts.
4. `#004` Session detail, outcomes, and handoffs.
5. `#009` Editor workflows and health surfaces.
6. `#005` Daemon lease hardening and CLI operations.
7. `#006` Real Pi Mono adapter.
8. `#008` Co-located local runtime execution.
9. `#007` Work item ingress and GitHub fresh-context upsert.
10. `#010` Security and operations hardening.
11. `#011` Deferred Go daemon and BoxLite/VM runtime documentation.

Rationale: filters should land before live UI tables; live data should land before richer UI workflows; orchestration must exist before connector ingress can start sessions; daemon identity should be hardened before production-like external runtimes; real Pi execution should exist before API-owned local runtime execution.

## Shared Architecture Decisions

- Keep route behavior in `apps/api/src/app.ts` for the next one or two slices, then extract helpers when the file becomes hard to scan.
- Extend `ControlPlaneStore` before adding route logic. Every method added to the interface must be implemented by both `MemoryStore` and `SQLiteStore`.
- Add protocol schemas before API or UI code consumes new payload shapes.
- Prefer narrow service modules for behavior that has business rules: filtering, overview aggregation, orchestration evaluation, session start, handoff transition, daemon auth, GitHub ingestion, runtime execution.
- Keep web pages as server components for read paths. Use small client components only for forms, filters, and optimistic controls.
- Keep user-run daemon uploads to events and structured outcomes by default. Source diffs, patches, and file content remain explicit runtime capabilities.

## Plan 001: Wire Web UI To Live API Data

**Files:**

- Modify `packages/protocol/src/index.ts`
- Modify `apps/api/src/store.ts`
- Modify `apps/api/src/app.ts`
- Create `apps/api/src/overview.ts`
- Create `apps/web/src/lib/api.ts`
- Modify `apps/web/src/app/page.tsx`
- Modify `apps/web/src/app/work-items/page.tsx`
- Modify `apps/web/src/app/orchestration/page.tsx`
- Modify `apps/web/src/app/sessions/page.tsx`
- Modify `apps/web/src/app/agents/page.tsx`
- Modify `apps/web/src/app/runtimes/page.tsx`
- Create `apps/web/src/components/EmptyState.tsx`
- Create `apps/web/src/app/loading.tsx`
- Create `apps/web/src/app/error.tsx`
- Test `apps/api/test/app.test.ts`
- Test `apps/web/src/lib/api.test.ts`
- Test `apps/web/src/components/AppShell.test.tsx`

**Goal:** Replace mock-only page data with typed API reads and add one overview payload that summarizes persisted control-plane state.

**Criteria:** All primary web routes can render from API data. Empty data renders compact empty states. API responses are validated through protocol schemas. `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.

Tasks:

- [ ] Task 001.1: Add overview protocol.
  - Write failing protocol tests in `packages/protocol/test/schemas.test.ts` for `OverviewSchema`.
  - Add `OverviewSchema` with `counts`, `runtimeHealth`, `handoffCount`, `daemonCount`, `activeSessionCount`, and `recentEvents`.
  - Run `pnpm --filter @automomo/protocol test`; expected before implementation: fail, after implementation: pass.

- [ ] Task 001.2: Add overview aggregation.
  - Write failing API test in `apps/api/test/app.test.ts` that creates work items, sessions, runtimes, handoffs, and events, then expects `GET /api/overview` to summarize them.
  - Add store read methods only if needed: `listHandoffs()`, `listOutcomes()`, and `listSessionEvents()` already covers events by session only, so add `listAllSessionEvents(limit?: number)`.
  - Implement `buildOverview(store)` in `apps/api/src/overview.ts`.
  - Add `app.get("/api/overview", ...)`.
  - Run `pnpm --filter @automomo/api test`.

- [ ] Task 001.3: Add typed web API client.
  - Write `apps/web/src/lib/api.test.ts` using a fake `fetchImpl`.
  - Implement `createAutomomoApiClient({ baseUrl, fetchImpl })` with methods for overview, codebases, work items, orchestration rules, sessions, agents, and runtimes.
  - Validate every response with Zod schemas from `@automomo/protocol`.
  - Use `process.env.AUTOMOMO_API_URL ?? "http://localhost:8000"` as default base URL.
  - Run `pnpm --filter @automomo/web test`.

- [ ] Task 001.4: Convert route pages to async API reads.
  - Replace mock imports in route pages with `getApiClient()` calls.
  - Add `export const dynamic = "force-dynamic"` to pages that must always reflect live control-plane state.
  - Add route-level `loading.tsx` and `error.tsx`.
  - Keep `apps/web/src/lib/mock-data.ts` only for tests and demos.
  - Run `pnpm --filter @automomo/web typecheck`.

- [ ] Task 001.5: Add compact empty states.
  - Create `EmptyState` with no large card wrapper; use a thin separator and compact copy.
  - Render empty states on all routes when lists are empty.
  - Extend static markup tests to assert empty state and no old review vocabulary.
  - Run `pnpm --filter @automomo/web test`.

- [ ] Task 001.6: Final verification.
  - Run `pnpm test`.
  - Run `pnpm typecheck`.
  - Run `pnpm lint`.
  - Run `pnpm build`.
  - Commit: `git commit -m "feat: wire web ui to live api data"`.

## Plan 002: Add Work Item And Session Filtering Contracts

**Files:**

- Modify `packages/protocol/src/index.ts`
- Modify `apps/api/src/store.ts`
- Modify `apps/api/src/app.ts`
- Create `apps/api/src/filters.ts`
- Modify `apps/api/test/app.test.ts`
- Modify `apps/web/src/lib/api.ts`

**Goal:** Add stable filtering and pagination for the two highest-volume list endpoints.

**Criteria:** Work item and session list endpoints accept typed query parameters, ignore unknown query parameters, use stable ordering, and return pagination metadata.

Tasks:

- [ ] Task 002.1: Define protocol query/result schemas.
  - Add `WorkItemListQuerySchema`, `SessionListQuerySchema`, `PaginationSchema`, `WorkItemListResponseSchema`, and `SessionListResponseSchema`.
  - Use `limit` default 50, max 200, and `offset` default 0.
  - Represent date filters as ISO strings: `createdAfter`, `createdBefore`, `updatedAfter`, `updatedBefore`.
  - Add schema tests for defaults, invalid enum rejection, and limit max.
  - Run `pnpm --filter @automomo/protocol test`.

- [ ] Task 002.2: Add store filter interfaces.
  - Add `listWorkItems(query?: WorkItemListQuery)` and `listSessions(query?: SessionListQuery)` to `ControlPlaneStore`.
  - Implement filtering in `MemoryStore` with deterministic sorting by `createdAt`, then `id`.
  - Implement filtering in `SQLiteStore`. Use Drizzle where practical and `sql` expressions for label/query matching when needed.
  - Return `{ items, page: { limit, offset, total } }` from store helper methods or from route helper wrappers.
  - Run `pnpm --filter @automomo/api typecheck`.

- [ ] Task 002.3: Add route query parsing.
  - Use `new URL(c.req.url).searchParams` inside `apps/api/src/app.ts`.
  - Convert query params to plain objects in `apps/api/src/filters.ts`.
  - Parse with protocol query schemas.
  - Keep unknown query params harmless.
  - Return 400 only for invalid known filters.

- [ ] Task 002.4: Add API tests.
  - Test work item filters: `codebaseId`, `source`, `status`, `assignee`, `q`, `limit`, `offset`.
  - Test session filters: `status`, `codebaseId`, `agentId`, `runtimeId`, `participant`, date range, `limit`, `offset`.
  - Test stable pagination by creating same timestamp records and expecting id tie-break ordering.
  - Run `pnpm --filter @automomo/api test`.

- [ ] Task 002.5: Update web API client.
  - Add optional query arguments to `listWorkItems()` and `listSessions()`.
  - Serialize only defined query values.
  - Validate response payloads with list response schemas.
  - Run `pnpm --filter @automomo/web test`.

- [ ] Task 002.6: Final verification.
  - Run `pnpm test`.
  - Run `pnpm typecheck`.
  - Commit: `git commit -m "feat: add work item and session filters"`.

## Plan 003: Implement Orchestration Rule Evaluation

**Files:**

- Modify `packages/protocol/src/index.ts`
- Create `apps/api/src/orchestration/evaluator.ts`
- Create `apps/api/src/sessions/start.ts`
- Modify `apps/api/src/store.ts`
- Modify `apps/api/src/app.ts`
- Test `apps/api/test/orchestration.evaluator.test.ts`
- Test `apps/api/test/app.test.ts`

**Goal:** Make orchestration rules executable, explainable, and capable of starting sessions or requiring human approval.

**Criteria:** Enabled rules can match work items, resolve agent/runtime, record why they matched, and create sessions with correct initial state. Disabled rules never match.

Tasks:

- [ ] Task 003.1: Define match result protocol.
  - Add `RuleEvaluationResultSchema` with `matched`, `ruleId`, `reason`, `agentId`, `runtimeId`, and `requiresHumanApproval`.
  - Add `SessionStartRequestSchema` and `SessionStartResultSchema`.
  - Add protocol tests for matched and no-match shapes.
  - Run `pnpm --filter @automomo/protocol test`.

- [ ] Task 003.2: Implement evaluator.
  - Match by `codebaseId`, `trigger`, `enabled`, labels, priority, source, status, connector type, and metadata key/value exact matches.
  - Treat array rule values as "any of".
  - Return the first matching rule sorted by `createdAt`, then `id`.
  - Explain mismatch and match reasons in plain metadata.
  - Run evaluator unit tests covering manual, webhook, sync, schedule, API, disabled, and no-match cases.

- [ ] Task 003.3: Implement session start service.
  - Add `startSessionFromWorkItem({ store, workItemId, trigger, now })`.
  - Resolve agent from rule `agentId`; resolve runtime from rule `runtimeId`, agent `defaultRuntimeId`, or no runtime.
  - If `humanApproval === "before_start"`, set session `needs_human`; otherwise `queued`.
  - Store `metadata.orchestration` with rule id and reason.
  - Update work item to `needs_human` or `ready`.

- [ ] Task 003.4: Add API entry points.
  - On `POST /api/work-items`, evaluate rules after saving work item.
  - Add `POST /api/work-items/:id/start` for manual start or re-evaluation.
  - Add route tests for auto-start, before-start approval, disabled rules, and no matching rule.
  - Run `pnpm --filter @automomo/api test`.

- [ ] Task 003.5: Final verification.
  - Run `pnpm test`.
  - Run `pnpm typecheck`.
  - Commit: `git commit -m "feat: evaluate orchestration rules"`.

## Plan 004: Complete Session Detail, Outcome, And Handoff Flows

**Files:**

- Modify `packages/protocol/src/index.ts`
- Modify `apps/api/src/store.ts`
- Create `apps/api/src/sessions/handoff.ts`
- Modify `apps/api/src/app.ts`
- Modify `apps/web/src/app/sessions/page.tsx`
- Create `apps/web/src/components/SessionDetailPanel.tsx`
- Create `apps/web/src/components/SessionTimeline.tsx`
- Create `apps/web/src/components/HandoffControls.tsx`
- Test `apps/api/test/app.test.ts`
- Test `apps/web/src/components/SessionDetailPanel.test.tsx`

**Goal:** Make sessions inspectable and controllable for human/AI co-work.

**Criteria:** A user can see session detail, timeline, outcome, and handoff state, and the API enforces valid handoff transitions.

Tasks:

- [ ] Task 004.1: Expand handoff protocol.
  - Extend handoff status/action modeling to support `requested`, `claimed`, `responded`, `resumed`, `approved`, `rejected`, and `completed`.
  - Add `HandoffActionSchema` with `action`, `reason`, `note`, and `claimedBy`.
  - Add session detail response schema with `session`, `events`, `handoffs`, `outcome`, `workItem`, `agent`, and `runtime`.
  - Run `pnpm --filter @automomo/protocol test`.

- [ ] Task 004.2: Add store reads.
  - Add `listHandoffs(sessionId)`, `getOutcome(id)`, and `getOutcomeForSession(sessionId)`.
  - Add SQLite row mappers for outcomes and handoffs if missing.
  - Test persistence across SQLite app instances.

- [ ] Task 004.3: Implement transition service.
  - Create `applyHandoffAction({ store, sessionId, action, now })`.
  - Enforce transitions: request input -> claimed -> responded -> resumed; approve/reject can complete a human checkpoint; reject marks session `failed` only when tied to final outcome review.
  - Append a `SessionEvent` of kind `handoff` for each action.
  - Update session status consistently.

- [ ] Task 004.4: Add detail and action routes.
  - Add `GET /api/sessions/:id`.
  - Replace current handoff route internals with transition service.
  - Add `POST /api/sessions/:id/resume`, `POST /api/sessions/:id/approve`, and `POST /api/sessions/:id/reject` if action-specific routes are cleaner than a generic handoff endpoint.
  - Route tests cover running, failed, completed, and handoff states.

- [ ] Task 004.5: Build session UI.
  - `SessionDetailPanel` renders compact header, participants, runtime, current state, outcome, and action controls.
  - `SessionTimeline` renders ordered events with kind labels.
  - `HandoffControls` is a client component for action POSTs.
  - Keep list + detail responsive: stack detail under rows on mobile.
  - Run `pnpm --filter @automomo/web test`.

- [ ] Task 004.6: Final verification.
  - Run `pnpm test`.
  - Run `pnpm typecheck`.
  - Run `pnpm build`.
  - Commit: `git commit -m "feat: complete session handoff flows"`.

## Plan 005: Harden Daemon Lease Protocol And CLI Operations

**Files:**

- Modify `packages/protocol/src/index.ts`
- Modify `apps/api/src/schema.ts`
- Modify `apps/api/src/store.ts`
- Create `apps/api/src/daemon/auth.ts`
- Create `apps/api/src/daemon/leases.ts`
- Modify `apps/api/src/app.ts`
- Modify `apps/daemon/src/client.ts`
- Modify `apps/daemon/src/worker.ts`
- Modify `apps/daemon/src/index.ts`
- Create `apps/daemon/src/config.ts`
- Create `apps/daemon/src/doctor.ts`
- Test `apps/api/test/daemon.test.ts`
- Test `apps/daemon/test/worker.test.ts`

**Goal:** Turn the daemon proof of flow into a safer lease protocol with pairing, identity, renewal, failure upload, and basic operator CLI commands.

**Criteria:** Unsigned daemon requests are rejected, leases can renew and expire, failures are recorded, and daemon `start`, `status`, and `doctor` commands work.

Tasks:

- [ ] Task 005.1: Define daemon identity protocol.
  - Add `DaemonSchema`, `DaemonRegistrationResponseSchema`, `DaemonSignedRequestHeadersSchema`, `LeaseRenewRequestSchema`, and `LeaseFailureUploadSchema`.
  - Include `daemonId`, `runtimeId`, `publicKey` or shared `secretId`, and `signatureVersion`.
  - Use shared HMAC for MVP to avoid premature public-key complexity.
  - Run `pnpm --filter @automomo/protocol test`.

- [ ] Task 005.2: Add daemon persistence.
  - Add `daemons` table and mapper.
  - Extend `runtime_leases` with `daemon_id`, `renewed_at`, `completed_at`, and `failed_at`.
  - Add `saveDaemon`, `getDaemon`, `renewLease`, `failLease`, and `reclaimExpiredLeases`.
  - Test MemoryStore and SQLiteStore behavior.

- [ ] Task 005.3: Implement request signing.
  - In `apps/api/src/daemon/auth.ts`, canonicalize `method`, `path`, timestamp, body SHA-256, daemon id, and runtime id.
  - Reject missing signature, stale timestamp, unknown daemon, mismatched runtime, and invalid digest.
  - In daemon client, sign register follow-up calls after registration.
  - Unit-test canonical string stability.

- [ ] Task 005.4: Add lease lifecycle routes.
  - Keep `/api/daemon/*` as compatibility routes and add `/api/daemons/*` aliases.
  - Add `POST /api/daemon/lease/renew`.
  - Add `POST /api/daemon/fail`.
  - Reject events/outcomes/failures for expired, completed, failed, or mismatched leases.
  - Add route tests for expired/reclaimed leases and signed requests.

- [ ] Task 005.5: Add daemon CLI commands.
  - Parse `automomo daemon start`, `automomo daemon status`, and `automomo daemon doctor`.
  - Persist daemon config in `.automomo/daemon.json` by default with API URL, runtime id, daemon id, and secret.
  - `doctor` checks API reachability, config file, workspace root, runtime command availability, and clock skew.
  - Test command parsing and doctor output with fake filesystem/fetch.

- [ ] Task 005.6: Final verification.
  - Run `pnpm --filter @automomo/api test`.
  - Run `pnpm --filter @automomo/daemon test`.
  - Run `pnpm test`.
  - Run `pnpm typecheck`.
  - Commit: `git commit -m "feat: harden daemon lease protocol"`.

## Plan 006: Replace Pi Runtime Stub With Real Pi Mono Adapter

**Files:**

- Modify `packages/pi-runtime/package.json`
- Modify `packages/pi-runtime/src/index.ts`
- Create `packages/pi-runtime/src/config.ts`
- Create `packages/pi-runtime/src/prompt.ts`
- Create `packages/pi-runtime/src/events.ts`
- Create `packages/pi-runtime/src/outcome.ts`
- Test `packages/pi-runtime/test/adapter.test.ts`
- Test `packages/pi-runtime/test/events.test.ts`
- Test `packages/pi-runtime/test/outcome.test.ts`

**Goal:** Integrate Pi Mono SDK execution while preserving the existing runner seam and daemon contract.

**Criteria:** Adapter can run in SDK mode with injected Pi session factory, map Pi events to automomo events, decode structured outcome, and preserve decode failures.

Tasks:

- [ ] Task 006.1: Add Pi dependency and config.
  - Add `@mariozechner/pi-coding-agent` to `packages/pi-runtime/package.json`.
  - Add `PiRuntimeConfigSchema` for mode, cwd, model, thinking level, tools mode, skills, context files, timeoutMs, and outcome schema.
  - Keep metadata-only runner available as `createMetadataOnlyRunner()` for tests.
  - Run `pnpm install`.

- [ ] Task 006.2: Build prompt composer.
  - Compose prompt from work item title/body, codebase id, session id, orchestration metadata, agent instructions, and required JSON outcome schema.
  - Include explicit instruction to return a final fenced JSON object matching `OutcomeSchema` result payload.
  - Test prompt includes work item context and omits secrets.

- [ ] Task 006.3: Build Pi event mapper.
  - Map text deltas to `kind: "text"` events.
  - Map tool calls/results to `kind: "tool"` events.
  - Map lifecycle/errors to `kind: "runtime"` or `kind: "failure"` events.
  - Preserve raw Pi event type in metadata.
  - Test sequence ordering and actor assignment.

- [ ] Task 006.4: Build outcome decoder.
  - Extract final JSON from a fenced block or last JSON object.
  - Parse status, summary, and result through `OutcomeSchema`.
  - On malformed output, return failed outcome plus failure event.
  - Test success, needs human, failed, and malformed output.

- [ ] Task 006.5: Implement SDK runner.
  - Use Pi SDK `createAgentSession` with cwd from runtime environment.
  - Use cwd-aware tool factories when tools are specified and cwd differs from `process.cwd()`.
  - Use `DefaultResourceLoader` overrides for skills and context files.
  - Subscribe to events before prompt execution.
  - Apply timeout with `AbortController` or a Promise race and mark timeout as failed outcome.
  - Unit-test with an injected fake session factory instead of real model calls.

- [ ] Task 006.6: Final verification.
  - Run `pnpm --filter @automomo/pi-runtime test`.
  - Run `pnpm --filter @automomo/daemon test`.
  - Run `pnpm test`.
  - Run `pnpm typecheck`.
  - Commit: `git commit -m "feat: add pi mono runtime adapter"`.

## Plan 007: Add Work Item Ingress And GitHub Fresh-Context Upsert

**Files:**

- Modify `packages/protocol/src/index.ts`
- Create `apps/api/src/work-items/upsert.ts`
- Create `apps/api/src/connectors/github/types.ts`
- Create `apps/api/src/connectors/github/client.ts`
- Create `apps/api/src/connectors/github/webhook.ts`
- Modify `apps/api/src/app.ts`
- Test `apps/api/test/work-items.upsert.test.ts`
- Test `apps/api/test/github.webhook.test.ts`

**Goal:** Build a connector-neutral ingestion path and add GitHub as the first external source without making GitHub the product model.

**Criteria:** Manual, API, and webhook work item creation share upsert logic. GitHub webhooks fetch fresh context before upsert. Duplicate source events do not create duplicate active sessions.

Tasks:

- [ ] Task 007.1: Add connector metadata contracts.
  - Extend connector metadata conventions for GitHub owner, repo, issue number, pull request number, node id, updated at, and source url.
  - Add `WorkItemUpsertRequestSchema` and `WorkItemUpsertResultSchema`.
  - Test that GitHub metadata is accepted but remains nested under `connector.metadata`.

- [ ] Task 007.2: Implement neutral upsert service.
  - `upsertWorkItemFromSource({ store, codebaseId, connector, title, body, labels, priority, source, now })`.
  - Find existing work item by connector type/id/url.
  - Preserve completed work items unless source updated timestamp is newer and policy allows reopening.
  - Evaluate orchestration rules after upsert when `evaluateRules` is true.
  - Unit-test create, update, dedupe, unknown codebase rejection.

- [ ] Task 007.3: Add GitHub client.
  - Use GitHub REST API with injected `fetchImpl`.
  - Fetch issue or pull request details after webhook receipt.
  - Normalize title, body, labels, url, state, author, and timestamps into connector metadata.
  - Do not store tokens in metadata.
  - Unit-test with fake GitHub responses.

- [ ] Task 007.4: Add webhook route.
  - Add `POST /api/webhooks/github`.
  - Verify webhook signature if a secret is configured.
  - Support `issues` and `pull_request` events first.
  - Fetch fresh context before calling upsert.
  - Return stable idempotent response with work item id and started session id when present.

- [ ] Task 007.5: Final verification.
  - Run `pnpm --filter @automomo/api test`.
  - Run `pnpm test`.
  - Run `pnpm typecheck`.
  - Commit: `git commit -m "feat: add github work item ingress"`.

## Plan 008: Implement Co-Located Local Runtime Execution

**Files:**

- Modify `packages/protocol/src/index.ts`
- Create `apps/api/src/runtime/provider.ts`
- Create `apps/api/src/runtime/local.ts`
- Create `apps/api/src/runtime/shell.ts`
- Create `apps/api/src/runtime/docker.ts`
- Create `apps/api/src/git/workspace.ts`
- Create `apps/api/src/runtime/execute.ts`
- Modify `apps/api/src/app.ts`
- Test `apps/api/test/runtime.local.test.ts`
- Test `apps/api/test/git.workspace.test.ts`

**Goal:** Support sessions where the API and runtime execute on the same machine.

**Criteria:** API can prepare a workspace, execute a shell or Docker runtime command with timeout, append events, store a structured outcome, and clean up safely.

Tasks:

- [ ] Task 008.1: Define runtime execution contracts.
  - Add `RuntimeExecutionRequestSchema`, `RuntimeExecutionResultSchema`, and runtime capability metadata conventions.
  - Represent source syncing, patches, file diffs, and secrets as explicit capabilities.
  - Run protocol tests.

- [ ] Task 008.2: Add workspace preparation.
  - Implement `prepareWorkspace({ codebase, sessionId })`.
  - For local codebases with `workspaceRoot`, use that path read-only by default.
  - For git/github codebases, clone or fetch into `.automomo/workspaces/<codebaseId>`.
  - Create isolated worktree `.automomo/runs/<sessionId>`.
  - Detect dirty worktrees and fail safely unless runtime capability permits dirty execution.

- [ ] Task 008.3: Add shell runtime provider.
  - Execute configured command with cwd, env allowlist, timeout, and max output bytes.
  - Convert stdout/stderr chunks into session events.
  - Parse final outcome from stdout JSON or an output file path.
  - Test success, timeout, non-zero exit, and malformed output.

- [ ] Task 008.4: Add Docker runtime provider.
  - Use `docker run --rm` with workspace mount, memory/cpu flags, env allowlist, and network policy.
  - Skip tests when Docker is unavailable; unit-test command assembly separately.
  - Keep Docker optional for MVP.

- [ ] Task 008.5: Add local execution API.
  - Add `POST /api/sessions/:id/run-local` for co-located execution.
  - Reject sessions not in `queued`, `resumed_by_agent`, or `needs_human` with approval.
  - Append runtime events and save outcome.
  - Test using this repo as a local workspace and a fake shell command that emits JSON.

- [ ] Task 008.6: Final verification.
  - Run `pnpm --filter @automomo/api test`.
  - Run `pnpm test`.
  - Run `pnpm typecheck`.
  - Commit: `git commit -m "feat: add local runtime execution"`.

## Plan 009: Add Editor Workflows And Health Surfaces

**Files:**

- Modify `apps/web/src/app/orchestration/page.tsx`
- Modify `apps/web/src/app/agents/page.tsx`
- Modify `apps/web/src/app/runtimes/page.tsx`
- Modify `apps/web/src/app/page.tsx`
- Modify `apps/web/src/components/AppShell.tsx`
- Create `apps/web/src/components/StatusStrip.tsx`
- Create `apps/web/src/components/RuleEditor.tsx`
- Create `apps/web/src/components/AgentEditor.tsx`
- Create `apps/web/src/components/RuntimeEditor.tsx`
- Create `apps/web/src/components/RuntimeHealthBadge.tsx`
- Test `apps/web/src/components/StatusStrip.test.tsx`
- Test `apps/web/src/components/RuleEditor.test.tsx`
- Test `apps/web/src/components/AgentEditor.test.tsx`
- Test `apps/web/src/components/RuntimeEditor.test.tsx`

**Goal:** Move the UI from read-only operational tables to compact configuration workflows and visible runtime health.

**Criteria:** Users can create/edit rules, agents, and runtimes; health appears in overview/top strip; controls remain readable on mobile.

Tasks:

- [ ] Task 009.1: Add status strip.
  - Build `StatusStrip` from overview data: runtime health, daemon count, active sessions, human handoffs.
  - Replace the static `launch-strip` copy in `AppShell`.
  - Test no overlap in static markup and correct labels.

- [ ] Task 009.2: Add rule editor.
  - Client component with fields for name, trigger, labels, priority, agent, runtime, enabled, and human approval policy.
  - Submit to `/api/orchestration-rules`.
  - Keep form compact: segmented controls/toggles/selects, no nested cards.
  - Test payload construction.

- [ ] Task 009.3: Add agent editor.
  - Client component with name, model, instructions, skills, tools, default runtime, and concurrency.
  - Submit to `/api/agents`.
  - Test required fields and runtime selection.

- [ ] Task 009.4: Add runtime editor and health badge.
  - Client component with mode, provider, workspace root, image, command, capacity, network policy, and secrets refs.
  - Render health badge for `idle`, `online`, `offline`, `busy`, and `unhealthy`.
  - Test payload and status rendering.

- [ ] Task 009.5: Wire pages.
  - Add create/edit drawers or inline panels on Orchestration, Agents, and Runtimes pages.
  - Use existing row density.
  - Add route-level empty states when no configurable objects exist.
  - Run `pnpm --filter @automomo/web test`.

- [ ] Task 009.6: Browser verification.
  - Run `pnpm dev:web`.
  - Capture desktop and mobile screenshots.
  - Verify primary controls do not overlap.
  - Run `pnpm --filter @automomo/web build`.
  - Commit: `git commit -m "feat: add automomo configuration editors"`.

## Plan 010: Add Security And Operations Hardening

**Files:**

- Modify `packages/protocol/src/index.ts`
- Modify `apps/api/src/schema.ts`
- Modify `apps/api/src/store.ts`
- Create `apps/api/src/auth/api-keys.ts`
- Create `apps/api/src/audit/audit.ts`
- Create `apps/api/src/security/redact.ts`
- Create `apps/api/src/security/rate-limit.ts`
- Modify `apps/api/src/app.ts`
- Modify `apps/daemon/src/client.ts`
- Test `apps/api/test/security.test.ts`
- Test `apps/api/test/audit.test.ts`
- Test `apps/api/test/redact.test.ts`

**Goal:** Add the safety layer needed before automomo runs on real codebases with external events and remote runtimes.

**Criteria:** API keys are codebase-scoped, security-sensitive routes are rate-limited, audit events are persisted, and secrets are redacted from stored event/outcome payloads.

Tasks:

- [ ] Task 010.1: Add API key model.
  - Add `ApiKeySchema` and scoped key metadata.
  - Store only hashed key material.
  - Add `createApiKey`, `findApiKeyByToken`, and scope-check helpers.
  - Test codebase-scoped access and rejection.

- [ ] Task 010.2: Add request auth middleware.
  - Protect write routes and webhook routes with API key auth when `AUTOMOMO_REQUIRE_API_KEY=true`.
  - Keep tests able to inject disabled auth for local development.
  - Return 401 for missing key, 403 for wrong codebase scope.

- [ ] Task 010.3: Add audit log.
  - Persist audit events for rule changes, daemon registration, lease creation/renewal/failure, session starts, handoffs, and outcome upload.
  - Include actor type, actor id, target type/id, timestamp, and redacted metadata.
  - Test each high-risk route writes an audit event.

- [ ] Task 010.4: Add redaction.
  - Redact environment variables with names matching token, secret, key, password, credential, cookie, and authorization.
  - Redact configured `secretRefs` values from event detail, metadata, and outcome result.
  - Apply before `appendSessionEvents` and `saveOutcome`.
  - Test nested object redaction.

- [ ] Task 010.5: Add in-memory rate limits.
  - Add route-level limits for GitHub webhooks and daemon endpoints.
  - Key by source IP plus daemon id or connector id.
  - Keep implementation replaceable for Redis later.
  - Test limit, reset, and independent keys.

- [ ] Task 010.6: Final verification.
  - Run `pnpm --filter @automomo/api test`.
  - Run `pnpm --filter @automomo/daemon test`.
  - Run `pnpm test`.
  - Run `pnpm typecheck`.
  - Commit: `git commit -m "feat: harden control plane operations"`.

## Plan 011: Defer Go Daemon And BoxLite Runtime

**Files:**

- Modify `docs/architecture/runtime-decision.md`
- Create `docs/architecture/daemon-protocol.md`
- Create `docs/architecture/runtime-capabilities.md`
- Modify `.context/todos/011-defer-go-daemon-and-boxlite-runtime.md`

**Goal:** Keep deferred runtime work documented without starting a second daemon implementation or VM provider prematurely.

**Criteria:** Docs clearly state the gates for Go daemon and BoxLite work, and the todo remains deferred until TypeScript runtime contracts stabilize.

Tasks:

- [ ] Task 011.1: Document daemon protocol gates.
  - Add `docs/architecture/daemon-protocol.md`.
  - Record current TypeScript daemon protocol, signing requirements, lease lifecycle, event/outcome upload shape, and compatibility route decision.
  - State Go daemon start criteria: stable signed protocol, CLI config shape, doctor checks, and lease renewal tests.

- [ ] Task 011.2: Document runtime capabilities.
  - Add `docs/architecture/runtime-capabilities.md`.
  - Define capabilities for shell, Docker, hosted, remote daemon, and future VM providers.
  - Include source sync, patch upload, file diff, network, secrets, snapshot, fork, timeout, and resource controls.
  - State BoxLite start criteria: local provider interface stable, capability flags rendered in UI, and tests for shell/Docker provider complete.

- [ ] Task 011.3: Update deferred todo.
  - Add plan links and defer-until conditions to `.context/todos/011-defer-go-daemon-and-boxlite-runtime.md`.
  - Keep status `pending` unless the team wants a separate `deferred` status vocabulary in the todo system.

- [ ] Task 011.4: Verification.
  - Run `git diff --check`.
  - Run `pnpm typecheck` to ensure docs changes did not coincide with broken workspace state.
  - Commit: `git commit -m "docs: document deferred runtime gates"`.

## Cross-Cutting Verification

After each execution slice:

- Run package-scoped tests first, then full workspace checks.
- Keep commits small and named by feature.
- Re-run the local-machine daemon e2e after daemon, Pi runtime, or runtime execution changes:
  - `pnpm --filter @automomo/daemon test -- local-runtime.e2e.test.ts`
- Re-run UI build after web changes:
  - `pnpm --filter @automomo/web build`

Before declaring the entire backlog executed:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- Browser check for desktop and mobile web routes.
- Local runtime e2e using this repo as the codebase.

## Self-Review

Spec coverage:

- `#001` is covered by Plan 001.
- `#002` is covered by Plan 002.
- `#003` is covered by Plan 003.
- `#004` is covered by Plan 004.
- `#005` is covered by Plan 005.
- `#006` is covered by Plan 006.
- `#007` is covered by Plan 007.
- `#008` is covered by Plan 008.
- `#009` is covered by Plan 009.
- `#010` is covered by Plan 010.
- `#011` is covered by Plan 011.

Dependency check:

- UI live data depends on list contracts for best table behavior, so `#002` is first.
- GitHub ingress depends on orchestration evaluation to avoid duplicating session-start policy, so `#007` follows `#003`.
- Co-located runtime depends on real runtime adapter semantics, so `#008` follows `#006`.
- Security hardening depends on daemon identity and connector ingress, so `#010` follows `#005` and `#007`.
- Go and BoxLite remain deferred until daemon/runtime interfaces settle.

Placeholder check:

- Every plan has concrete files, goals, criteria, commands, and commit messages.
- Unknown implementation decisions are converted into explicit early tasks, not left as open blanks.
