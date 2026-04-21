# Room-First Workspace Redesign Implementation Plan

**Goal:** Reframe automomo from a control-plane dashboard into a room-first human/agent collaboration workspace for codebases.
**Architecture:** The room becomes the primary operating surface. Humans steer agents through chat and direct runtime edits; work items, sessions, outcomes, agents, and runtimes are contextual surfaces inside rooms, with global pages becoming secondary cross-room views.
**Tech Stack:** pnpm workspaces, TypeScript, Next.js App Router, React Server Components plus focused client islands, Zod protocol schemas, Hono API, SQLite/Drizzle, Vitest, Chrome DevTools MCP for E2E validation.

---

## Source And Scope

Input source:

- User direction: "we need ot make a plan for this. we can discard the control plan idea."
- Previous design review conclusion: automomo currently exposes backend nouns as flat CRUD pages, while `oz-workspace` makes rooms the main collaboration surface.
- Reference implementation: `/Users/randomradio/src/oz-workspace`, especially:
  - `components/app-sidebar.tsx`
  - `app/(workspace)/room/[roomId]/page.tsx`
  - `components/chat-stream.tsx`
  - `components/mention-textarea.tsx`
  - `components/kanban-board.tsx`
  - `components/artifacts-panel.tsx`

New product assumption:

- "Control plane" is no longer the user-facing product frame.
- Backend orchestration still exists, but users should experience automomo as shared rooms where humans and agents work together on code.
- Runtime and lease mechanics are operational details shown where useful, not the main navigation structure.

Must-have outcomes:

- Room is the primary daily workspace.
- Sidebar shows rooms and agents as live entities, not only static product nouns.
- Room view supports chat, mentions, room-scoped work board, sessions, outcomes/artifacts, and runtime presence.
- Global Work Items remains useful as a cross-room progress view.
- Existing API/protocol model is reused where possible; avoid unnecessary schema churn.
- UI becomes coherent enough to keep extending without adding more one-off CSS sections.

Out of scope for this plan:

- Full Tailwind/shadcn migration.
- Real-time SSE/WebSocket streaming.
- Multi-user auth and workspace switching.
- Browser-based code editor.
- Full artifact storage schema.
- Renaming every internal `ControlPlaneStore` symbol. Internal names can be cleaned up later after the product frame is stable.

Complexity: large. The work crosses shell information architecture, room UX, chat interaction, work item board behavior, API mutations, visual primitives, tests, and E2E validation. Execute in phases; each phase should leave the app shippable.

## Research Summary

Current automomo state:

- `Room`, `RoomAgent`, `RoomMessage`, `RoomTask`, `WorkItem.roomId`, and `Session.roomId` already exist in `packages/protocol/src/index.ts`.
- Room detail currently exists at `apps/web/src/app/rooms/[id]/page.tsx`, but it is structured as stacked admin sections.
- The web shell in `apps/web/src/components/AppShell.tsx` has flat static nav: Overview, Work Items, Orchestration, Sessions, Rooms, Agents, Runtimes.
- Chat posting works through `RoomChatComposer`, but it reloads the page and uses a form-like author field.
- Work items render through generic `DataRows`, not a board.
- API currently supports create/list flows for rooms, room messages, room agents, room tasks, work items, sessions, agents, and runtimes.
- API currently does not expose status update routes for work item board moves.
- Web app has no component primitive layer beyond custom CSS in `globals.css`.

Reference `oz-workspace` patterns to borrow:

- Sidebar groups live rooms and agents under a workspace identity.
- Room page has one compact header and tabs.
- Chat is the primary steering surface with a bottom composer.
- Mention textarea supports keyboard autocomplete.
- Tasks use a board with compact draggable cards.
- Artifacts/outcomes are a side panel, not another top-level nav.
- Agent identity uses color, icon, avatar, and status consistently.

Architecture conclusion:

- Keep automomo's stronger backend/runtime model.
- Replace the UI mental model from "manage orchestration objects" to "work with agents in rooms."
- Use Oz as the interaction reference, not as a codebase to copy wholesale.

## Architecture Decision

### Chosen Product Shape

```text
Codebase
  -> Room
      -> Human messages
      -> Agent memberships
      -> Work items
          -> Sessions
              -> Events
              -> Outcomes
      -> Runtime presence
      -> Human handoffs
```

### Chosen UI Shape

```text
Workspace Shell
  Sidebar
    Workspace identity
    Home / Inbox
    Rooms
    Agents
    Operations
    Settings
  Main
    Room Workspace
      Header
      Chat tab
      Board tab
      Sessions tab
      Outcomes tab
```

### Chosen Implementation Approach

Use a small automomo-native primitive layer first, not a Tailwind/shadcn migration.

Reasoning:

- automomo currently has no Tailwind pipeline.
- A full shadcn migration would turn this plan into a styling migration and delay product correction.
- We can still borrow Oz's interaction architecture with local primitives: `Button`, `IconButton`, `Tabs`, `Badge`, `Avatar`, `Panel`, `TextField`, `Textarea`, `Dialog`.
- Tailwind/shadcn can be reconsidered after the room-first architecture proves itself.

## Task 1: Write Room-First Product Architecture Doc

**Files:**

- Create: `docs/architecture/room-first-workspace.md`
- Modify: `README.md`

**Goal:** Make the product direction explicit before changing UI.
**Criteria:** Docs describe automomo as a room-first human/agent workspace and do not present "control plane" as the product surface.

- [ ] Step 1: Add a failing documentation check.

  Create `apps/web/src/components/AppShell.test.tsx` or extend the existing test to assert that the shell exposes Rooms as the primary grouping and no visible "Control Plane" copy.

  Run: `pnpm --filter @automomo/web test -- AppShell`

  Expected: FAIL until the shell copy changes.

- [ ] Step 2: Create `docs/architecture/room-first-workspace.md`.

  Include:

  - Product thesis: rooms are the operating surface.
  - Human steering modes: chat messages and direct runtime file edits.
  - Agent participation: joined agents receive mentions and create sessions/outcomes.
  - Work model: room board uses work items; sessions are execution attempts.
  - Runtime model: runtime is reusable code plus environment attached to agents/sessions.
  - What "control plane" means now: internal coordination implementation, not user-facing IA.

- [ ] Step 3: Update `README.md`.

  Update the opening description and quick-start language to emphasize:

  - Rooms
  - Agents
  - Codebase runtimes
  - Work boards
  - Human handoffs

  Remove or demote control-plane wording if present.

- [ ] Step 4: Verify.

  Run:

  - `pnpm --filter @automomo/web test -- AppShell`
  - `rg -n "Control Plane|control plane" README.md docs apps/web/src`

  Expected:

  - Test passes.
  - Any remaining "control plane" references are explicitly internal architecture notes.

## Task 2: Establish UI Primitives And Visual Tokens

**Files:**

- Create: `apps/web/src/components/ui/Button.tsx`
- Create: `apps/web/src/components/ui/IconButton.tsx`
- Create: `apps/web/src/components/ui/Badge.tsx`
- Create: `apps/web/src/components/ui/Avatar.tsx`
- Create: `apps/web/src/components/ui/Tabs.tsx`
- Create: `apps/web/src/components/ui/Panel.tsx`
- Create: `apps/web/src/components/ui/Field.tsx`
- Create: `apps/web/src/components/ui/index.ts`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/components/ui/ui.test.tsx`

**Goal:** Stop growing one-off CSS and give the room workspace a consistent component language.
**Criteria:** Reusable primitives render accessible markup, use existing automomo tokens, and support compact dashboard density.

- [ ] Step 1: Write primitive render tests.

  Test:

  - `Button` renders `button` with variants `primary`, `secondary`, `ghost`, `danger`.
  - `IconButton` has an accessible label.
  - `Badge` supports status tones.
  - `Tabs` renders a tablist and links/buttons with active state.
  - `Avatar` supports initials plus optional color.
  - `Panel` supports header/body regions.

  Run: `pnpm --filter @automomo/web test -- ui`

  Expected: FAIL because primitives do not exist.

- [ ] Step 2: Implement primitives.

  Keep APIs intentionally small:

  ```ts
  type Tone = "neutral" | "green" | "yellow" | "red" | "blue";
  type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
  ```

  Use class names like:

  - `ui-button ui-button-primary`
  - `ui-badge ui-badge-green`
  - `ui-avatar`
  - `ui-panel`
  - `ui-tabs`

- [ ] Step 3: Refactor CSS tokens.

  In `globals.css`, keep current color spirit but reorganize around:

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

  Avoid adding a large design system. This pass should make current UI coherent, not ornate.

- [ ] Step 4: Verify.

  Run:

  - `pnpm --filter @automomo/web test -- ui`
  - `pnpm --filter @automomo/web typecheck`

  Expected: PASS.

## Task 3: Replace Flat AppShell With Room-First Workspace Shell

**Files:**

- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/components/AppShell.test.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/rooms/page.tsx`
- Modify: all pages currently passing `active` as flat product noun as needed.

**Goal:** Make rooms and agents the core navigation model.
**Criteria:** Sidebar shows workspace identity, rooms list, agents list/status, operations group, and settings. Global object pages are secondary.

- [ ] Step 1: Write failing shell tests.

  Assertions:

  - Shell renders `automomo` workspace identity.
  - Shell renders a `Rooms` group with room links.
  - Shell renders an `Agents` group with agent names and status dots.
  - Shell renders an `Operations` group containing Work Items, Sessions, Runtimes, Orchestration.
  - Shell does not present Work Items/Sessions/Runtimes as equal top-level peers to Rooms.

  Run: `pnpm --filter @automomo/web test -- AppShell`

  Expected: FAIL until shell accepts dynamic context.

- [ ] Step 2: Update `AppShell` props.

  Target shape:

  ```ts
  export interface ShellRoom {
    id: string;
    name: string;
    status: string;
  }

  export interface ShellAgent {
    id: string;
    name: string;
    color?: string;
    icon?: string;
    status?: "idle" | "running" | "offline";
  }

  export interface AppShellProps {
    active: string;
    activeRoomId?: string;
    rooms?: ShellRoom[];
    agents?: ShellAgent[];
    overview?: Overview;
    children: ReactNode;
  }
  ```

- [ ] Step 3: Add agent visual helpers.

  Add `apps/web/src/lib/agentVisuals.ts`:

  - `getAgentColor(agent)`
  - `getAgentIcon(agent)`
  - `getAgentInitials(agent)`

  Read `agent.metadata.color` and `agent.metadata.icon`, with deterministic fallbacks.

- [ ] Step 4: Feed shell context from pages.

  For now, pages that already fetch API data should pass `rooms.items` and `agents`.

  Do not introduce app-wide client state yet.

- [ ] Step 5: Verify.

  Run:

  - `pnpm --filter @automomo/web test -- AppShell`
  - `pnpm --filter @automomo/web typecheck`

  Expected: PASS.

## Task 4: Rebuild Room Detail As The Primary Workspace

**Files:**

- Modify: `apps/web/src/app/rooms/[id]/page.tsx`
- Create: `apps/web/src/components/RoomWorkspace.tsx`
- Create: `apps/web/src/components/RoomHeader.tsx`
- Create: `apps/web/src/components/RoomTabs.tsx`
- Create: `apps/web/src/components/RoomRuntimePresence.tsx`
- Modify: `apps/web/src/app/rooms/[id]/page.test.tsx`

**Goal:** Replace the stacked admin page with a compact room workspace.
**Criteria:** The room route has one room header and tabs for Chat, Board, Sessions, and Outcomes.

- [ ] Step 1: Write failing room page tests.

  Assertions:

  - Room page renders room name in a compact header.
  - Room page renders tabs: `Chat`, `Board`, `Sessions`, `Outcomes`.
  - Room page renders joined agent count in the header.
  - Room page renders runtime presence in the header or side panel.
  - Room page does not render the old `Room action` header.

  Run: `pnpm --filter @automomo/web test -- rooms`

  Expected: FAIL.

- [ ] Step 2: Create `RoomWorkspace`.

  Props:

  ```ts
  interface RoomWorkspaceProps {
    room: Room;
    codebase?: Codebase;
    agents: Agent[];
    joinedAgents: Agent[];
    messages: RoomMessage[];
    workItems: WorkItem[];
    tasks: RoomTask[];
    sessions: Session[];
    runtimes: Runtime[];
  }
  ```

  Use internal client state only for tab selection.

- [ ] Step 3: Create `RoomHeader`.

  Header content:

  - `# room.name`
  - codebase name
  - joined agent avatars/count
  - active/running session count
  - runtime health summary
  - compact actions: manage agents, new work, settings

- [ ] Step 4: Update route data fetching.

  In `rooms/[id]/page.tsx`, fetch:

  - overview
  - rooms
  - codebases
  - agents
  - runtimes
  - room agents
  - room messages
  - room work items
  - room tasks
  - room sessions via `api.listSessions({ roomId: room.id })`

- [ ] Step 5: Verify.

  Run:

  - `pnpm --filter @automomo/web test -- rooms`
  - `pnpm --filter @automomo/web typecheck`

  Expected: PASS.

## Task 5: Replace Form Chat With Room Chat Stream And Mention Composer

**Files:**

- Replace or heavily modify: `apps/web/src/components/RoomChatComposer.tsx`
- Create: `apps/web/src/components/RoomChatStream.tsx`
- Create: `apps/web/src/components/MentionTextarea.tsx`
- Create: `apps/web/src/lib/mentions.ts`
- Modify: `apps/web/src/components/OperationalComponents.test.tsx`
- Modify: `apps/web/package.json`

**Goal:** Make chat feel like human/agent collaboration, not an admin form.
**Criteria:** Users can type `@`, choose agents by keyboard/mouse, send messages without full reload, and see human/agent messages with identities.

- [ ] Step 1: Add dependencies only if needed.

  Preferred minimal dependency additions:

  - `react-markdown`
  - `remark-gfm`
  - `@phosphor-icons/react`

  Avoid Tailwind/shadcn dependencies in this phase.

- [ ] Step 2: Write failing tests.

  Test `findMentionMatches`:

  - matches `@Planner`
  - matches `@product-lead`
  - ignores email addresses
  - handles punctuation boundaries

  Test `MentionTextarea`:

  - typing `@p` shows filtered agents.
  - ArrowDown/Enter inserts mention.
  - Escape closes menu.

  Test `RoomChatStream`:

  - renders messages oldest to newest.
  - renders agent mentions with mention styling.
  - sends message through `/api/rooms/:id/messages`.
  - appends sent message locally without `window.location.reload`.

  Run: `pnpm --filter @automomo/web test -- Mention RoomChat`

  Expected: FAIL.

- [ ] Step 3: Implement `lib/mentions.ts`.

  Export:

  - `findMentionMatches(content, agentNames)`
  - `normalizeMentionName(name)`

- [ ] Step 4: Implement `MentionTextarea`.

  Borrow Oz behavior:

  - Detect `@` at start or after whitespace/punctuation.
  - Filter agents by query.
  - Support ArrowUp, ArrowDown, Enter, Tab, Escape.
  - Insert `@AgentName ` at cursor.
  - Keep focus after insertion.

- [ ] Step 5: Implement `RoomChatStream`.

  Behavior:

  - Message list scrolls independently.
  - Bottom composer stays visible.
  - No author input; human author defaults to `Operator` for now.
  - Send button disabled for blank/sending.
  - On failure, show inline error.
  - On success, append message and clear input.

- [ ] Step 6: Wire `RoomWorkspace` Chat tab.

  Replace old `RoomChatComposer` and raw `message-thread` with `RoomChatStream`.

- [ ] Step 7: Verify.

  Run:

  - `pnpm --filter @automomo/web test -- Mention RoomChat`
  - `pnpm --filter @automomo/web typecheck`

  Expected: PASS.

## Task 6: Add Room Work Board Backed By Work Items

**Files:**

- Create: `apps/web/src/components/RoomWorkBoard.tsx`
- Create: `apps/web/src/components/RoomWorkCard.tsx`
- Modify: `apps/web/src/components/RoomWorkItemForm.tsx`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/app.test.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/work-items/page.tsx`
- Modify: `apps/web/src/app/work-items/page.test.tsx`

**Goal:** Make room work visible as a board, while preserving WorkItem as the durable execution target.
**Criteria:** Room board groups work items into columns and supports creating work and updating status.

- [ ] Step 1: Write failing API tests for work item updates.

  Add tests:

  - `PATCH /api/work-items/:id` updates status.
  - Rejects invalid status with 400.
  - Rejects room/codebase mismatch when changing `roomId`.
  - Updates `updatedAt`.

  Run: `pnpm --filter @automomo/api test -- app.test.ts`

  Expected: FAIL because PATCH does not exist.

- [ ] Step 2: Add API route.

  Add:

  ```text
  PATCH /api/work-items/:id
  ```

  Supported patch fields:

  - `title`
  - `body`
  - `status`
  - `priority`
  - `labels`
  - `roomId`
  - `metadata`

  Enforce:

  - Work item exists.
  - If `roomId` is supplied, room exists.
  - Room codebase matches work item codebase.
  - Write auth uses `work_items:write`.

- [ ] Step 3: Add web API client method.

  Add:

  ```ts
  updateWorkItem(id: string, body: Record<string, unknown>)
  ```

- [ ] Step 4: Write failing board tests.

  Assertions:

  - Board renders columns: `Open`, `Active`, `Human`, `Done`.
  - `open` and `ready` appear under Open.
  - `running` appears under Active.
  - `needs_human` appears under Human.
  - `completed`, `failed`, and `cancelled` appear under Done.
  - Inline create creates a room work item.
  - Moving a card calls `updateWorkItem`.

  Run: `pnpm --filter @automomo/web test -- RoomWorkBoard`

  Expected: FAIL.

- [ ] Step 5: Implement `RoomWorkBoard`.

  Board design:

  - Compact four-column layout.
  - Each card shows title, status, priority, labels, source, latest session indicator if available.
  - Use click buttons or select controls first; drag/drop can come after basic status updates pass.
  - Inline `Add work` appears in Open column.

- [ ] Step 6: Replace room work rows.

  In `RoomWorkspace` Board tab, use `RoomWorkBoard`.

- [ ] Step 7: Keep global Work Items as reporting.

  Update `/work-items` copy/layout to read as "Across rooms" instead of the main queue.

- [ ] Step 8: Verify.

  Run:

  - `pnpm --filter @automomo/api test -- app.test.ts`
  - `pnpm --filter @automomo/web test -- RoomWorkBoard work-items`
  - `pnpm --filter @automomo/web typecheck`

  Expected: PASS.

## Task 7: Add Room Sessions And Outcomes Panels

**Files:**

- Create: `apps/web/src/components/RoomSessionsPanel.tsx`
- Create: `apps/web/src/components/RoomOutcomesPanel.tsx`
- Modify: `apps/web/src/components/SessionDetailPanel.tsx`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/rooms/[id]/page.test.tsx`

**Goal:** Make runtime execution visible inside the room instead of sending users to global Sessions first.
**Criteria:** Room workspace shows session progress, handoff state, and durable results/outcomes for that room.

- [ ] Step 1: Write failing tests.

  Assertions:

  - Room Sessions tab lists room sessions.
  - Running, failed, completed, and needs-human states have distinct badges.
  - A selected session shows timeline/handoff controls.
  - Outcomes tab renders completed outcome summaries when available.

  Run: `pnpm --filter @automomo/web test -- RoomSessions RoomOutcomes`

  Expected: FAIL.

- [ ] Step 2: Add API helper methods if needed.

  Existing `listSessions({ roomId })` and `getSession(id)` may be enough.

  If outcome data is too expensive to fetch per session, add:

  ```text
  GET /api/rooms/:id/sessions
  ```

  returning session details with outcome summaries.

- [ ] Step 3: Implement `RoomSessionsPanel`.

  Contents:

  - Compact list of sessions.
  - Agent/runtime labels.
  - Status badge.
  - Latest event summary.
  - Handoff action area for selected session.

- [ ] Step 4: Implement `RoomOutcomesPanel`.

  Initial implementation may derive "artifacts" from session outcomes:

  - outcome summary
  - result metadata
  - events uploaded count
  - linked session/work item

  Do not add an `Artifact` schema until a concrete storage need appears.

- [ ] Step 5: Wire into `RoomWorkspace` tabs.

- [ ] Step 6: Verify.

  Run:

  - `pnpm --filter @automomo/web test -- RoomSessions RoomOutcomes rooms`
  - `pnpm --filter @automomo/web typecheck`

  Expected: PASS.

## Task 8: Add Agent Identity To UI Without Schema Churn

**Files:**

- Modify: `apps/web/src/components/AgentEditor.tsx`
- Create: `apps/web/src/components/AgentAvatar.tsx`
- Modify: `apps/web/src/app/agents/page.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/components/RoomChatStream.tsx`
- Modify: `apps/web/src/components/RoomWorkCard.tsx`
- Test: `apps/web/src/components/OperationalComponents.test.tsx`

**Goal:** Make agents feel like participants rather than config rows.
**Criteria:** Agents have deterministic visual identity across sidebar, chat, board, and sessions.

- [ ] Step 1: Write failing tests.

  Assertions:

  - Agent editor submits `metadata.color` and `metadata.icon`.
  - `AgentAvatar` renders initials if no icon exists.
  - Sidebar uses agent color dot/avatar.
  - Chat messages from agents use agent identity.

  Run: `pnpm --filter @automomo/web test -- Agent`

  Expected: FAIL.

- [ ] Step 2: Add color/icon controls.

  Use metadata to avoid protocol/schema migration:

  ```json
  {
    "metadata": {
      "color": "#3B82F6",
      "icon": "robot"
    }
  }
  ```

- [ ] Step 3: Add deterministic fallbacks.

  If metadata is missing:

  - color comes from hash of agent id/name.
  - icon defaults to simple initials or a generic agent glyph.

- [ ] Step 4: Verify.

  Run:

  - `pnpm --filter @automomo/web test -- Agent`
  - `pnpm --filter @automomo/web typecheck`

  Expected: PASS.

## Task 9: Surface Runtime Presence In Rooms

**Files:**

- Create: `apps/web/src/components/RuntimePresenceBadge.tsx`
- Create: `apps/web/src/components/RoomRuntimePanel.tsx`
- Modify: `apps/web/src/components/RuntimeHealthBadge.tsx`
- Modify: `apps/web/src/components/RoomHeader.tsx`
- Modify: `apps/web/src/app/runtimes/page.tsx`
- Test: `apps/web/src/components/OperationalComponents.test.tsx`

**Goal:** Show runtime as the shared code environment for room work, not as a detached admin object.
**Criteria:** Room header/panel tells the human which runtime is attached, whether it is healthy, and whether agents are currently using it.

- [ ] Step 1: Write failing tests.

  Assertions:

  - Room header shows runtime health when room sessions reference runtimes.
  - Local runtime shows workspace root.
  - Remote daemon/hosted runtimes use distinct labels.
  - Busy/unhealthy/offline statuses are visually distinct.

  Run: `pnpm --filter @automomo/web test -- RuntimePresence`

  Expected: FAIL.

- [ ] Step 2: Implement runtime matching.

  Runtime association priority:

  - session runtime ids for current room
  - joined agents' `defaultRuntimeId`
  - codebase local runtime by matching `environment.workspaceRoot`
  - fallback: "No runtime attached"

- [ ] Step 3: Implement `RoomRuntimePanel`.

  Show:

  - runtime name
  - mode/provider
  - status
  - workspace root
  - active session count
  - last heartbeat

- [ ] Step 4: Verify.

  Run:

  - `pnpm --filter @automomo/web test -- RuntimePresence`
  - `pnpm --filter @automomo/web typecheck`

  Expected: PASS.

## Task 10: Demote Global Operations Pages

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/work-items/page.tsx`
- Modify: `apps/web/src/app/sessions/page.tsx`
- Modify: `apps/web/src/app/orchestration/page.tsx`
- Modify: `apps/web/src/app/runtimes/page.tsx`
- Modify: `apps/web/src/app/settings/page.tsx`
- Modify: `apps/web/src/components/WorkspaceHeader.tsx`

**Goal:** Keep global views, but make them read as reporting/operations instead of the primary product.
**Criteria:** Users land in rooms or room selection; global pages summarize cross-room state.

- [ ] Step 1: Write failing page tests.

  Assertions:

  - Home page emphasizes rooms and recent activity.
  - Work Items page title/copy indicates cross-room view.
  - Sessions page title/copy indicates operations history.
  - Settings/Operations groups contain orchestration and runtimes.

  Run: `pnpm --filter @automomo/web test -- page work-items`

  Expected: FAIL.

- [ ] Step 2: Update Home.

  Home should show:

  - active rooms
  - recent room messages/events
  - active sessions
  - handoffs needing attention
  - runtime health strip

- [ ] Step 3: Update Work Items.

  Make it a grouped cross-room board/report:

  - group by room
  - show unassigned group
  - link cards back to room
  - do not position it as "the work queue"

- [ ] Step 4: Update Sessions.

  Make it an operations history:

  - filter by room/agent/runtime/status
  - link each row to room context

- [ ] Step 5: Update Orchestration/Runtimes.

  Keep these pages, but route them from Operations/Settings.

- [ ] Step 6: Verify.

  Run:

  - `pnpm --filter @automomo/web test`
  - `pnpm --filter @automomo/web typecheck`

  Expected: PASS.

## Task 11: Visual Cleanup And Responsive Pass

**Files:**

- Modify: `apps/web/src/app/globals.css`
- Modify: all room workspace components created in earlier tasks.

**Goal:** Make the app feel like one product instead of accumulated sections.
**Criteria:** Desktop and mobile layouts are readable, controls do not overlap, and the room workspace has stable dimensions.

- [ ] Step 1: Add responsive expectations to tests where possible.

  Unit tests should verify semantic structure. Chrome validates layout.

- [ ] Step 2: Clean CSS.

  Remove or replace old classes after migration:

  - `upgrade` if it still implies control-plane pairing.
  - old room admin section styles no longer used.
  - duplicate button styles replaced by UI primitives.

- [ ] Step 3: Add stable layout constraints.

  Desktop:

  - fixed sidebar width
  - room header 48-56px
  - chat stream fills available height
  - composer fixed to bottom of room panel
  - board columns keep min width and scroll horizontally if needed

  Mobile:

  - sidebar collapses above content or becomes top nav
  - tabs remain readable
  - composer and buttons do not overlap
  - board columns become horizontal scroll or stacked tabs

- [ ] Step 4: Verify with Chrome.

  Use Chrome DevTools MCP:

  - `/`
  - `/rooms`
  - `/rooms/room_dev`
  - `/work-items`
  - `/agents`
  - `/runtimes`
  - `/sessions`

  Validate desktop and mobile viewports:

  - 1440x900
  - 1280x800
  - 390x844

  Check:

  - no text overlap
  - no blank primary panels
  - focusable controls are visible
  - room chat and board remain usable

## Task 12: End-To-End Room Workflow Validation

**Files:**

- Modify tests as needed.
- Update PR description or validation docs after execution.

**Goal:** Prove the room-first workflow works as a product flow.
**Criteria:** A human can create or open a room, join agents, mention an agent, create work, move work through states, inspect sessions/outcomes, and see runtime status.

- [ ] Step 1: Start services.

  Run:

  ```sh
  AUTOMOMO_DB_PATH=/tmp/automomo-room-first.sqlite pnpm --filter @automomo/api dev --port 8001
  AUTOMOMO_API_URL=http://localhost:8001 pnpm --filter @automomo/web exec next dev --port 3002
  ```

- [ ] Step 2: Run automated verification.

  Run:

  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm build`
  - `git diff --check`

  Expected: PASS.

- [ ] Step 3: Run Chrome E2E.

  Validate:

  - Open app.
  - Navigate to a room from sidebar.
  - Join/create an agent.
  - Type `@` and select an agent in chat.
  - Send a room message without full page reload.
  - Create a room work item.
  - Move work item status.
  - Start or inspect a session.
  - Request/claim/respond to a handoff.
  - Inspect outcomes/artifacts.
  - Confirm runtime presence is visible.
  - Confirm global Work Items groups by room.

- [ ] Step 4: Capture screenshots.

  Save:

  - `/tmp/automomo-room-first-desktop.png`
  - `/tmp/automomo-room-first-mobile.png`
  - `/tmp/automomo-room-board.png`

- [ ] Step 5: Update PR summary.

  Include:

  - What changed in product frame.
  - Validation commands.
  - Chrome E2E coverage.
  - Screenshots.

## Execution Order

Recommended commit sequence:

1. `docs: define room-first workspace direction`
2. `feat(web): add automomo ui primitives`
3. `feat(web): make shell room first`
4. `feat(web): rebuild room workspace`
5. `feat(web): add mention chat stream`
6. `feat(api): support work item status updates`
7. `feat(web): add room work board`
8. `feat(web): add room sessions and outcomes panels`
9. `feat(web): add agent identity and runtime presence`
10. `refactor(web): demote global operations pages`
11. `test: validate room-first workflow`

## Risk Review

- **Risk:** Redesign becomes a dependency migration.
  - Mitigation: local primitives first; no Tailwind/shadcn migration in this plan.
- **Risk:** Room workspace becomes visually dense.
  - Mitigation: tabs separate chat, board, sessions, and outcomes; right context panel only on larger screens.
- **Risk:** Existing global pages break during shell changes.
  - Mitigation: update shell tests first and migrate pages incrementally.
- **Risk:** Work item board needs update APIs not currently present.
  - Mitigation: add narrow `PATCH /api/work-items/:id` before board drag/status controls.
- **Risk:** Agent identity requires schema migration.
  - Mitigation: store color/icon in existing `metadata` first; promote fields later if needed.
- **Risk:** Outcomes/artifacts model is premature.
  - Mitigation: derive Outcomes panel from existing session outcomes before adding an `Artifact` noun.

## Definition Of Done

- The user-facing UI no longer frames automomo as a control-plane dashboard.
- `/rooms/:id` is the primary workspace for human/agent collaboration.
- Room chat supports real mentions and no page reload on send.
- Room board uses work items and supports status changes.
- Sessions, outcomes, runtime health, and handoffs are visible inside room context.
- Global Work Items and Sessions are cross-room reporting/operations views.
- Desktop and mobile Chrome validation passes without layout overlap.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check` pass.

