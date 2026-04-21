# Room-First Workspace Execution Plan

**Goal:** Execute the room-first redesign from `docs/plans/2026-04-21-room-first-workspace-redesign.md` in reviewable, test-driven slices.
**Architecture:** Keep the existing automomo protocol/API model, but reorganize the web product around rooms as the primary workspace. Shell navigation, chat, work boards, sessions, outcomes, runtime presence, and global operations pages are updated in dependency order so every slice leaves the app usable.
**Tech Stack:** pnpm workspaces, TypeScript, Next.js App Router, React 19, React Server Components with client islands, Hono, Zod, SQLite/Drizzle, Vitest SSR-style tests, Chrome DevTools MCP validation.

---

## Source And Scope

Source plan:

- `docs/plans/2026-04-21-room-first-workspace-redesign.md`

## Execution Status: 2026-04-21

Status: implemented and validated on branch `codex/room-first-workspace-redesign`.

Completed product changes:

- Room-first shell with dynamic room and agent navigation.
- Room detail workspace with chat, board, sessions, outcomes, and runtime context tabs.
- Mention-aware room chat with client-side message append.
- Room-scoped work board with status updates through `PATCH /api/work-items/:id`.
- Room session, handoff, outcome, and runtime presence panels.
- Agent visual identity controls.
- Global operations pages reframed as secondary cross-room reporting surfaces.
- Responsive CSS cleanup across desktop, tablet-ish, and mobile widths.
- URL hash persistence for room workspace tabs so board/session/outcome actions keep context through refreshes.

Validation completed:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `git diff --check`
- Chrome desktop validation at `1440x900`
- Chrome tablet-ish validation at `1280x800`
- Chrome mobile validation at `390x844`
- Chrome console check with no remaining warnings/errors after hard reload.

Screenshots captured:

- `/tmp/automomo-room-first-home-desktop.png`
- `/tmp/automomo-room-first-board-desktop.png`
- `/tmp/automomo-room-first-outcomes-desktop.png`
- `/tmp/automomo-room-first-work-items-desktop.png`
- `/tmp/automomo-room-first-board-tablet.png`
- `/tmp/automomo-room-first-board-mobile.png`
- `/tmp/automomo-room-first-chat-mobile.png`

The implementation checklist below is preserved as the original execution breakdown.

Current repo facts confirmed during planning:

- Web tests are Vitest SSR-style tests using `renderToStaticMarkup`.
- There is no jsdom/browser unit-test setup, so rich interactions should be covered by pure helper tests, static markup tests, and Chrome E2E.
- `WorkItem.roomId`, `Session.roomId`, `Room`, `RoomAgent`, `RoomMessage`, and `RoomTask` already exist.
- `GET/POST /api/rooms/:id/work-items` already exists.
- `PATCH /api/work-items/:id` does not exist and is needed for board status changes.
- The current room page is already functional but section-stacked.
- The current shell is flat and static.
- The current web app has no UI primitive layer.

Product decision:

- Discard "control plane" as the user-facing frame.
- Keep orchestration/control-plane concepts as internal implementation details.
- The visible product is a shared codebase room where humans and agents work together.

Execution rule:

- Do not combine all redesign work in one change.
- Land in slices that are individually testable and usable.
- Use Chrome E2E after the room workspace, chat, and board slices.

## Implementation Dependency Graph

```text
Docs and vocabulary
  -> UI primitives and tokens
    -> room-first shell
      -> room workspace layout
        -> chat stream and mentions
        -> work item update API
          -> room work board
        -> sessions/outcomes panels
        -> runtime presence
      -> global operations page demotion
        -> visual cleanup
          -> Chrome E2E validation
```

## Architecture Choices

### UI System

Use automomo-native primitives first:

- `Button`
- `IconButton`
- `Badge`
- `Avatar`
- `Tabs`
- `Panel`
- `Field`

Do not migrate to Tailwind/shadcn in this execution pass.

Reason:

- automomo currently ships plain CSS and SSR tests.
- A framework migration would slow down the product hierarchy correction.
- A small primitive layer lets us stop growing unrelated one-off classes in `globals.css`.

### Chat

Implement chat as a client island:

- `RoomChatStream` owns local message state after first server render.
- `MentionTextarea` owns mention dropdown state.
- `findMentionMatches` stays pure and testable.
- Sending a message appends locally after API success.
- No `window.location.reload()`.

Do not add realtime streaming in this pass.

### Board

Use `WorkItem` as the board card.

Column mapping:

- `Open`: `open`, `ready`
- `Active`: `running`
- `Human`: `needs_human`
- `Done`: `completed`, `failed`, `cancelled`

Status changes use a narrow `PATCH /api/work-items/:id`.

### Outcomes

Use existing `Outcome` records through session detail first.

Do not add a new `Artifact` schema yet.

### Agent Identity

Use existing `Agent.metadata`:

```json
{
  "color": "#3B82F6",
  "icon": "robot"
}
```

Add deterministic fallback helpers so old agents render consistently.

## Slice 1: Room-First Vocabulary And Docs

**Commit:** `docs: define room-first workspace direction`

**Files:**

- Create: `docs/architecture/room-first-workspace.md`
- Modify: `README.md`
- Modify: `apps/web/src/components/AppShell.test.tsx`

**Goal:** Make the product frame explicit before changing behavior.

**Implementation steps:**

- [ ] Add an `AppShell` test assertion that rendered shell markup contains `Rooms` and `Agents` and does not contain `Control Plane`.
- [ ] Create `docs/architecture/room-first-workspace.md` with sections:
  - `Product Frame`
  - `Core Nouns`
  - `Room Workspace`
  - `Human Steering`
  - `Agent Participation`
  - `Runtime Role`
  - `Internal Orchestration`
- [ ] Update `README.md` opening paragraph to describe automomo as a room-first human/AI workspace for codebase runtimes.
- [ ] Keep any remaining "control plane" references restricted to internal architecture explanation.

**Verification:**

- `pnpm --filter @automomo/web test -- AppShell`
- `rg -n "Control Plane|control plane" README.md docs apps/web/src`

**Done when:**

- Tests pass.
- Search output contains no user-facing control-plane product language.

## Slice 2: UI Primitives And Tokens

**Commit:** `feat(web): add compact ui primitives`

**Files:**

- Create: `apps/web/src/components/ui/Button.tsx`
- Create: `apps/web/src/components/ui/IconButton.tsx`
- Create: `apps/web/src/components/ui/Badge.tsx`
- Create: `apps/web/src/components/ui/Avatar.tsx`
- Create: `apps/web/src/components/ui/Tabs.tsx`
- Create: `apps/web/src/components/ui/Panel.tsx`
- Create: `apps/web/src/components/ui/Field.tsx`
- Create: `apps/web/src/components/ui/index.ts`
- Create: `apps/web/src/components/ui/ui.test.tsx`
- Modify: `apps/web/src/app/globals.css`

**Goal:** Establish a stable component language before rebuilding the shell and room page.

**Implementation steps:**

- [ ] Add SSR tests in `ui.test.tsx` using `renderToStaticMarkup`.
- [ ] Test `Button` variants: `primary`, `secondary`, `ghost`, `danger`.
- [ ] Test `IconButton` requires `aria-label`.
- [ ] Test `Badge` tones: `neutral`, `green`, `yellow`, `red`, `blue`.
- [ ] Test `Avatar` renders initials and optional color style.
- [ ] Test `Tabs` renders `role="tablist"` and active tab state.
- [ ] Test `Panel` renders a titled section.
- [ ] Implement primitives as thin wrappers around semantic elements.
- [ ] Add CSS classes:
  - `.ui-button`
  - `.ui-icon-button`
  - `.ui-badge`
  - `.ui-avatar`
  - `.ui-tabs`
  - `.ui-panel`
  - `.ui-field`
- [ ] Add normalized tokens in `globals.css` while keeping existing colors:
  - `--surface`
  - `--surface-subtle`
  - `--surface-rail`
  - `--text`
  - `--text-muted`
  - `--border`
  - `--accent`
  - `--danger`
  - `--radius-sm`
  - `--radius-md`
  - `--sidebar-width`

**Verification:**

- `pnpm --filter @automomo/web test -- ui`
- `pnpm --filter @automomo/web typecheck`

**Done when:**

- New primitives pass SSR tests.
- Existing web typecheck passes.
- No page has been visually redesigned yet, keeping this slice low risk.

## Slice 3: Agent Visual Helpers

**Commit:** `feat(web): add agent visual identity helpers`

**Files:**

- Create: `apps/web/src/lib/agentVisuals.ts`
- Create: `apps/web/src/lib/agentVisuals.test.ts`
- Create: `apps/web/src/components/AgentAvatar.tsx`
- Modify: `apps/web/src/components/OperationalComponents.test.tsx`

**Goal:** Give agents consistent identity before using them in sidebar, chat, board, and sessions.

**Implementation steps:**

- [ ] Add tests for `getAgentColor`.
- [ ] Add tests for `getAgentIcon`.
- [ ] Add tests for `getAgentInitials`.
- [ ] Implement metadata reads:
  - `metadata.color` is used when it is a non-empty string.
  - `metadata.icon` is used when it is a non-empty string.
- [ ] Implement deterministic color fallback from `agent.id || agent.name`.
- [ ] Implement initials fallback:
  - `"Ralph"` -> `"R"`
  - `"Backend Lead"` -> `"BL"`
  - empty/unknown -> `"A"`
- [ ] Implement `AgentAvatar` using `Avatar` primitive.
- [ ] Add SSR test that `AgentAvatar` renders color, initials, and accessible title text.

**Verification:**

- `pnpm --filter @automomo/web test -- agentVisuals OperationalComponents`
- `pnpm --filter @automomo/web typecheck`

**Done when:**

- Agent identity can be reused without schema changes.

## Slice 4: Room-First App Shell

**Commit:** `feat(web): make navigation room first`

**Files:**

- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/components/AppShell.test.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/rooms/page.tsx`
- Modify: `apps/web/src/app/work-items/page.tsx`
- Modify: `apps/web/src/app/sessions/page.tsx`
- Modify: `apps/web/src/app/agents/page.tsx`
- Modify: `apps/web/src/app/runtimes/page.tsx`
- Modify: `apps/web/src/app/orchestration/page.tsx`
- Modify: `apps/web/src/app/settings/page.tsx`

**Goal:** Replace flat product-noun navigation with workspace, rooms, agents, and operations groups.

**Implementation steps:**

- [ ] Update `AppShell` props:
  - `active`
  - `activeRoomId`
  - `rooms`
  - `agents`
  - `overview`
  - `children`
- [ ] Add shell types in `AppShell.tsx`:
  - `ShellRoom`
  - `ShellAgent`
- [ ] Render sidebar groups:
  - workspace identity
  - Home
  - Rooms
  - Agents
  - Operations
  - Settings
- [ ] Put Work Items, Sessions, Runtimes, Orchestration under Operations.
- [ ] Render room links as `/rooms/:id`.
- [ ] Render agent visual marker using `AgentAvatar` or color dot.
- [ ] Keep `StatusStrip` visible but make it compact and operational.
- [ ] Update all pages to pass `rooms.items` and `agents` when available.
- [ ] Pages that do not already fetch rooms/agents should fetch them in parallel with existing data.
- [ ] Update tests to assert Rooms and Agents are dynamic groups, and Work Items is under Operations.

**Verification:**

- `pnpm --filter @automomo/web test -- AppShell`
- `pnpm --filter @automomo/web typecheck`

**Done when:**

- The sidebar hierarchy communicates room-first usage.
- Existing pages still render.

## Slice 5: Room Workspace Skeleton

**Commit:** `feat(web): rebuild room workspace shell`

**Files:**

- Create: `apps/web/src/components/RoomWorkspace.tsx`
- Create: `apps/web/src/components/RoomHeader.tsx`
- Create: `apps/web/src/components/RoomWorkspaceTabs.tsx`
- Create: `apps/web/src/components/RoomRuntimePresence.tsx`
- Modify: `apps/web/src/app/rooms/[id]/page.tsx`
- Modify: `apps/web/src/app/rooms/[id]/page.test.tsx`
- Modify: `apps/web/src/lib/api.ts`

**Goal:** Replace the stacked room admin page with a single workspace surface and tabs.

**Implementation steps:**

- [ ] Extend room page test mock to include:
  - `listRuntimes`
  - `listSessions({ roomId })`
- [ ] Add test assertions:
  - room header contains room name.
  - tab labels include `Chat`, `Board`, `Sessions`, `Outcomes`.
  - header includes joined agent count.
  - header includes runtime presence text.
  - old `Room action` text is absent.
- [ ] Implement `RoomWorkspace` as a client component for tab state.
- [ ] Keep initial tabs rendered as buttons with `aria-selected`.
- [ ] Pass server-fetched data from `rooms/[id]/page.tsx` into `RoomWorkspace`.
- [ ] Fetch room sessions with existing `api.listSessions({ roomId })`.
- [ ] Fetch runtimes with existing `api.listRuntimes()`.
- [ ] Move old chat/work/agent controls into temporary tab content so behavior is preserved while layout changes.
- [ ] Remove `WorkspaceHeader` from room detail.

**Verification:**

- `pnpm --filter @automomo/web test -- rooms`
- `pnpm --filter @automomo/web typecheck`

**Done when:**

- Room detail visually becomes a workspace with tabs.
- Existing room chat/work functionality remains reachable.

## Slice 6: Mention Parsing And Chat Stream

**Commit:** `feat(web): add mention chat stream`

**Files:**

- Create: `apps/web/src/lib/mentions.ts`
- Create: `apps/web/src/lib/mentions.test.ts`
- Create: `apps/web/src/components/MentionTextarea.tsx`
- Create: `apps/web/src/components/RoomChatStream.tsx`
- Modify: `apps/web/src/components/RoomChatComposer.tsx`
- Modify: `apps/web/src/components/OperationalComponents.test.tsx`
- Modify: `apps/web/src/components/RoomWorkspace.tsx`

**Goal:** Replace form-style room chat with a room chat stream and mention-aware composer.

**Implementation steps:**

- [ ] Add pure tests for `normalizeMentionName`.
- [ ] Add pure tests for `findMentionMatches`:
  - `@Ralph` matches.
  - `(@Ralph)` matches.
  - `**@Ralph**` matches.
  - `name@example.com` does not match.
  - `@Unknown` does not match known agents.
- [ ] Implement `findMentionMatches(content, agentNames)` with boundary checks.
- [ ] Implement `MentionTextarea` as a client component.
- [ ] Keep dropdown state internal.
- [ ] Support keyboard handling:
  - ArrowDown
  - ArrowUp
  - Enter
  - Tab
  - Escape
- [ ] Implement `RoomChatStream` as a client component.
- [ ] Initialize local messages from server-provided messages.
- [ ] Render oldest to newest.
- [ ] Render author as `Human {name}`, `Agent {name}`, or system name.
- [ ] Render recognized mentions with `.mention-token`.
- [ ] Submit to `/api/rooms/:roomId/messages`.
- [ ] On successful response, append returned `roomMessage`.
- [ ] On failure, render inline error.
- [ ] Remove `window.location.reload()` from chat flow.
- [ ] Keep `RoomChatComposer` as a compatibility wrapper or delete it after all imports move to `RoomChatStream`.

**Verification:**

- `pnpm --filter @automomo/web test -- mentions OperationalComponents rooms`
- `pnpm --filter @automomo/web typecheck`

**Done when:**

- Chat no longer reloads the page.
- Mentions are parsed and visually distinct.
- Chrome later covers actual keyboard/mouse mention interaction.

## Slice 7: Work Item PATCH API

**Commit:** `feat(api): support work item updates`

**Files:**

- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/app.test.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/api.test.ts`

**Goal:** Add the narrow mutation needed for room board status changes.

**Implementation steps:**

- [ ] Add API test: `PATCH /api/work-items/:id` updates status from `open` to `running`.
- [ ] Add API test: invalid status returns `400`.
- [ ] Add API test: unknown work item returns `404`.
- [ ] Add API test: changing `roomId` to a room from another codebase returns `409`.
- [ ] Add API test: valid patch updates `updatedAt`.
- [ ] Add `patchJson` test helper or extend current `json()` helper to support method override.
- [ ] Define `patchWorkItemBody` in `apps/api/src/app.ts` using `createWorkItemBody.partial()`, while forbidding `id`, `codebaseId`, `createdAt`, and `updatedAt` from client mutation.
- [ ] Add route `app.patch("/api/work-items/:id", ...)`.
- [ ] Use current item for `codebaseId`.
- [ ] Validate target room when `roomId` is present.
- [ ] Preserve `createdAt`.
- [ ] Set `updatedAt` to `now()`.
- [ ] Audit with action `work_item.update`.
- [ ] Add web client `patch(path, body)`.
- [ ] Add web client method `updateWorkItem(id, body)`.
- [ ] Add web API client test for `PATCH /api/work-items/work_1`.

**Verification:**

- `pnpm --filter @automomo/api test -- app.test.ts`
- `pnpm --filter @automomo/web test -- api`
- `pnpm typecheck`

**Done when:**

- Work item status can change without creating a new work item.

## Slice 8: Room Work Board

**Commit:** `feat(web): add room work board`

**Files:**

- Create: `apps/web/src/components/RoomWorkBoard.tsx`
- Create: `apps/web/src/components/RoomWorkCard.tsx`
- Create: `apps/web/src/components/RoomWorkBoard.test.tsx`
- Modify: `apps/web/src/components/RoomWorkItemForm.tsx`
- Modify: `apps/web/src/components/RoomWorkspace.tsx`
- Modify: `apps/web/src/app/work-items/page.tsx`
- Modify: `apps/web/src/app/work-items/page.test.tsx`

**Goal:** Make room work a board, not a generic row list.

**Implementation steps:**

- [ ] Add board tests with SSR markup.
- [ ] Test column grouping:
  - `open`, `ready` -> Open
  - `running` -> Active
  - `needs_human` -> Human
  - `completed`, `failed`, `cancelled` -> Done
- [ ] Test card renders title, priority, labels, source, and status.
- [ ] Test card has status action controls with endpoint metadata.
- [ ] Implement `RoomWorkCard`.
- [ ] Implement `RoomWorkBoard`.
- [ ] Use button/select controls for status changes in this slice.
- [ ] Use client fetch to call `updateWorkItem`.
- [ ] Optimistically update card status after successful response.
- [ ] Show inline error on failure.
- [ ] Keep `RoomWorkItemForm` for inline create, but style it as board create rather than side form.
- [ ] Render `RoomWorkBoard` in Board tab.
- [ ] Update global `/work-items` page copy to `Across rooms`.
- [ ] Keep global work grouped by room and link back to room detail.

**Verification:**

- `pnpm --filter @automomo/web test -- RoomWorkBoard work-items rooms`
- `pnpm --filter @automomo/web typecheck`

**Done when:**

- Room work appears as a board.
- Status changes are possible through the UI.

## Slice 9: Room Sessions Panel

**Commit:** `feat(web): show room sessions in workspace`

**Files:**

- Create: `apps/web/src/components/RoomSessionsPanel.tsx`
- Create: `apps/web/src/components/RoomSessionsPanel.test.tsx`
- Modify: `apps/web/src/components/RoomWorkspace.tsx`
- Modify: `apps/web/src/components/SessionDetailPanel.tsx`

**Goal:** Bring session progress and handoff state into the room.

**Implementation steps:**

- [ ] Add SSR tests for `RoomSessionsPanel`.
- [ ] Test statuses render with badges:
  - queued
  - running
  - needs_human
  - completed
  - failed
- [ ] Test session rows show agent name when available.
- [ ] Test session rows show runtime name when available.
- [ ] Test panel includes handoff controls for selected or first needs-human session.
- [ ] Implement `RoomSessionsPanel` props:
  - `sessions`
  - `agents`
  - `runtimes`
  - `workItems`
- [ ] Reuse `SessionDetailPanel` for expanded detail.
- [ ] Render compact session list first, detail below or beside it depending on available space.
- [ ] Wire Sessions tab in `RoomWorkspace`.

**Verification:**

- `pnpm --filter @automomo/web test -- RoomSessionsPanel rooms`
- `pnpm --filter @automomo/web typecheck`

**Done when:**

- A user can inspect room execution state without leaving the room.

## Slice 10: Room Outcomes Panel

**Commit:** `feat(web): show room outcomes`

**Files:**

- Create: `apps/web/src/components/RoomOutcomesPanel.tsx`
- Create: `apps/web/src/components/RoomOutcomesPanel.test.tsx`
- Modify: `apps/web/src/components/RoomWorkspace.tsx`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/api.test.ts`

**Goal:** Show durable agent results in room context.

**Implementation steps:**

- [ ] Add client helper `getSession(id)` usage where outcome detail is required.
- [ ] Keep first implementation server-friendly by deriving outcomes from session details already fetched for selected sessions.
- [ ] Add `RoomOutcomesPanel` tests:
  - empty state renders `No outcomes yet`.
  - successful outcome renders summary.
  - failed outcome renders failed tone.
  - outcome links back to session id and work item title.
- [ ] Implement `RoomOutcomesPanel`.
- [ ] Wire Outcomes tab in `RoomWorkspace`.
- [ ] Do not create an `Artifact` schema in this slice.

**Verification:**

- `pnpm --filter @automomo/web test -- RoomOutcomesPanel rooms api`
- `pnpm --filter @automomo/web typecheck`

**Done when:**

- Completed room work has a visible result surface.

## Slice 11: Runtime Presence In Rooms

**Commit:** `feat(web): surface room runtime presence`

**Files:**

- Create: `apps/web/src/components/RoomRuntimePanel.tsx`
- Create: `apps/web/src/components/RuntimePresenceBadge.tsx`
- Create: `apps/web/src/components/RoomRuntimePanel.test.tsx`
- Modify: `apps/web/src/components/RoomRuntimePresence.tsx`
- Modify: `apps/web/src/components/RoomHeader.tsx`
- Modify: `apps/web/src/components/RuntimeHealthBadge.tsx`

**Goal:** Show runtime as the shared code environment supporting room work.

**Implementation steps:**

- [ ] Add tests for runtime association priority:
  - runtime ids from room sessions
  - joined agents' `defaultRuntimeId`
  - codebase workspace root match
  - fallback with no runtime
- [ ] Implement helper `getRoomRuntimeCandidates`.
- [ ] Render runtime mode/provider labels:
  - Local
  - Remote daemon
  - Hosted
- [ ] Render status labels:
  - idle
  - online
  - offline
  - busy
  - unhealthy
- [ ] Render workspace root for local/runtime environments.
- [ ] Show active session count and last heartbeat when present.
- [ ] Wire compact runtime presence into `RoomHeader`.
- [ ] Wire detailed runtime panel into room side/context area.

**Verification:**

- `pnpm --filter @automomo/web test -- RoomRuntimePanel OperationalComponents`
- `pnpm --filter @automomo/web typecheck`

**Done when:**

- Runtime context is visible from room header and room detail.

## Slice 12: Agent Editor Identity Controls

**Commit:** `feat(web): add agent identity controls`

**Files:**

- Modify: `apps/web/src/components/AgentEditor.tsx`
- Modify: `apps/web/src/app/agents/page.tsx`
- Modify: `apps/web/src/components/OperationalComponents.test.tsx`

**Goal:** Let newly created agents carry the visual identity used by rooms.

**Implementation steps:**

- [ ] Extend `buildAgentPayload` tests to include `color` and `icon`.
- [ ] Add fields:
  - color input/select using a fixed palette.
  - icon input/select using simple names.
- [ ] Store submitted values under `metadata.color` and `metadata.icon`.
- [ ] Render agent list with `AgentAvatar`.
- [ ] Keep model/instructions/skills/tools behavior unchanged.

**Verification:**

- `pnpm --filter @automomo/web test -- OperationalComponents`
- `pnpm --filter @automomo/web typecheck`

**Done when:**

- New agents have identity metadata.
- Old agents still render with deterministic fallbacks.

## Slice 13: Demote Global Operations Pages

**Commit:** `refactor(web): demote global operations views`

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/work-items/page.tsx`
- Modify: `apps/web/src/app/sessions/page.tsx`
- Modify: `apps/web/src/app/orchestration/page.tsx`
- Modify: `apps/web/src/app/runtimes/page.tsx`
- Modify: `apps/web/src/app/settings/page.tsx`
- Modify: `apps/web/src/components/WorkspaceHeader.tsx`
- Modify: existing page tests.

**Goal:** Make global pages support room-first work instead of competing with it.

**Implementation steps:**

- [ ] Home page becomes `Rooms home`.
- [ ] Home shows:
  - active rooms
  - recent room messages
  - active sessions
  - handoffs needing attention
  - runtime health
- [ ] Work Items page title becomes `Across rooms`.
- [ ] Work Items page groups by room and links to room workspace.
- [ ] Sessions page title becomes `Session history`.
- [ ] Sessions page shows room, agent, runtime, and status.
- [ ] Orchestration page copy says rules automate room work, not the whole product.
- [ ] Runtimes page copy says runtimes are reusable code environments.
- [ ] Settings page keeps setup/configuration.
- [ ] Remove stale page actions like inert `Filter` and non-functional `New` buttons, or convert them to actual links/forms.

**Verification:**

- `pnpm --filter @automomo/web test`
- `pnpm --filter @automomo/web typecheck`

**Done when:**

- Global pages read as reporting/operations surfaces.
- The room remains the dominant product destination.

## Slice 14: CSS Cleanup And Responsive Layout

**Commit:** `refactor(web): clean room-first layout styles`

**Files:**

- Modify: `apps/web/src/app/globals.css`
- Modify: room workspace components from previous slices.

**Goal:** Remove old stacked-section styling and make the app responsive.

**Implementation steps:**

- [ ] Remove unused classes after migration:
  - `.upgrade`
  - old room admin-only classes no longer referenced.
  - duplicate button styles replaced by UI primitives.
- [ ] Add stable desktop layout:
  - fixed sidebar width with `--sidebar-width`.
  - room header height between 48px and 56px.
  - room workspace fills viewport height.
  - chat stream scrolls independently.
  - composer stays visible at bottom of chat panel.
  - board columns use stable min widths.
- [ ] Add mobile layout:
  - sidebar becomes a compact top/stacked navigation.
  - tabs remain reachable.
  - board becomes horizontal scroll or stacked columns.
  - chat composer does not overlap messages.
- [ ] Ensure focus states are visible on links, buttons, tabs, inputs, and textareas.
- [ ] Ensure no text uses viewport-width font scaling.
- [ ] Ensure letter spacing remains non-negative.

**Verification:**

- `pnpm --filter @automomo/web typecheck`
- `pnpm --filter @automomo/web test`
- Chrome visual pass in Slice 15.

**Done when:**

- Layout is stable on desktop and mobile.

## Slice 15: Chrome E2E Validation

**Commit:** `test: validate room-first workspace flow`

**Files:**

- Update PR description or validation notes after execution.

**Goal:** Prove the full room-first product flow works in a real browser.

**Implementation steps:**

- [ ] Start API:

  ```sh
  AUTOMOMO_DB_PATH=/tmp/automomo-room-first.sqlite pnpm --filter @automomo/api dev --port 8001
  ```

- [ ] Start web:

  ```sh
  AUTOMOMO_API_URL=http://localhost:8001 pnpm --filter @automomo/web exec next dev --port 3002
  ```

- [ ] Validate desktop viewport `1440x900`.
- [ ] Validate tablet-ish viewport `1280x800`.
- [ ] Validate mobile viewport `390x844`.
- [ ] E2E flow:
  - open `/`
  - navigate to a room from sidebar
  - join or create an agent
  - type `@` and select an agent
  - send message
  - confirm no full page reload
  - create room work
  - move room work status
  - inspect room sessions
  - request and claim a handoff
  - inspect outcomes tab
  - inspect runtime presence
  - open global Work Items and confirm grouping by room
- [ ] Capture screenshots:
  - `/tmp/automomo-room-first-desktop.png`
  - `/tmp/automomo-room-first-mobile.png`
  - `/tmp/automomo-room-board.png`
- [ ] Check Chrome console for errors.
- [ ] Check network for unexpected 4xx/5xx responses.

**Verification:**

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `git diff --check`

**Done when:**

- All commands pass.
- Chrome E2E flow passes.
- Screenshots are saved.
- Dev servers remain available if the user wants to inspect.

## Execution Notes

### Current Test Constraints

- Rich browser interactions cannot be fully unit-tested with the current SSR-only Vitest setup.
- Use pure helper tests for parsing/grouping logic.
- Use static markup tests for component structure.
- Use Chrome DevTools MCP for actual keyboard, click, layout, and network validation.

### Review Boundaries

Recommended review checkpoints:

1. After Slice 4: room-first shell is visible.
2. After Slice 6: chat steering works.
3. After Slice 8: room board works.
4. After Slice 11: runtime/session context works.
5. After Slice 15: full E2E validation.

### Rollback Boundaries

- Slices 1-3 are safe foundation work.
- Slice 4 changes navigation and should be reviewed before deeper page rewrites.
- Slice 7 is the only required API mutation change for the board.
- Slices 8-13 can be reverted individually if a UI direction feels wrong.

## Final Definition Of Done

- automomo no longer feels like a control-plane dashboard.
- Rooms and agents are visible from the primary shell.
- `/rooms/:id` is the main daily workspace.
- Chat supports real `@agent` steering.
- Work items are room board cards.
- Sessions, handoffs, outcomes, and runtime presence are visible inside room context.
- Global pages support cross-room operations and reporting.
- Desktop and mobile layouts are validated in Chrome.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check` pass.
