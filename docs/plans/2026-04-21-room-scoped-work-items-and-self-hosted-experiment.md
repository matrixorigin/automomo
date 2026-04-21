# Room-Scoped Work Items And Self-Hosted Experiment Implementation Plan

**Goal:** Make rooms the primary collaboration container by attaching work items directly to rooms, rendering room-scoped boards from work items, and documenting how this repo can later become automomo's first self-hosted development experiment.
**Architecture:** A room belongs to one codebase and contains many work items. Work items remain the durable execution targets, sessions remain runtime attempts, room messages remain the human steering channel, and room tasks remain optional lightweight subtasks/checklist items under room work.
**Tech Stack:** pnpm workspaces, TypeScript, Zod, Hono, better-sqlite3, Drizzle table definitions, Vitest, Next.js App Router, React Server Components.

---

## Source And Scope

Input source:

- User direction: "workitem or room ? I think a room can have one or more workitems, the kanban board is room scoped but can be viewed directly from global perpective to see tasks progress for each room. Human only steers agents by send message or they can just edit files in runtime."
- Current branch: `codex/rooms-agent-groups`
- Current implementation: `Room`, `RoomAgent`, `RoomMessage`, `RoomTask`, and `Session.roomId` already exist.

Scope:

- Add `roomId` to `WorkItem`.
- Add room-scoped work item filtering, creation, persistence, and session propagation.
- Render room boards from work items.
- Keep `RoomTask` as a smaller coordination primitive linked to a room and optionally a work item.
- Document the self-hosted experiment model for this repo.

Out of scope for this plan:

- Agent mention dispatch from room messages.
- Real-time room event streaming.
- Direct browser-based file editing.
- Runtime file-diff or patch upload.
- Multi-session capacity scheduling.

Complexity: medium. The change crosses protocol, API persistence, API routes, web API client, mock data, two pages, and docs, but follows established patterns.

## Research Summary

Current implementation patterns:

- Protocol schemas live in `packages/protocol/src/index.ts`; tests use `packages/protocol/test/schemas.test.ts`.
- `WorkItemSchema` currently has `codebaseId` but no `roomId`.
- `SessionSchema` already has `roomId`.
- `RoomTaskSchema` already has `workItemId`, so lightweight room subtasks can point at durable work.
- API route logic lives in `apps/api/src/app.ts`.
- Work item filtering is parsed in `apps/api/src/filters.ts` and applied in `filterWorkItems()` inside `apps/api/src/store.ts`.
- SQLite persistence is inline: Drizzle table declarations in `apps/api/src/schema.ts`, DDL in `SQLiteStore.ensureSchema()`, row mapping in `rowToWorkItem()`, and `addColumnIfMissing()` for additive columns.
- API tests use `app.request()` with a local `json()` helper.
- The web API client validates API payloads with protocol schemas in `apps/web/src/lib/api.ts`.
- Rooms page currently fetches rooms, room agents, room messages, room tasks, and all work items.
- Work Items page currently renders a global flat list and hardcodes the visible codebase label as `automomo`.

Architecture conclusion:

- `Room` should be the working surface.
- `WorkItem` should be the room board card and execution target.
- `Session` should inherit `roomId` from its work item when created from work.
- `RoomTask` should remain available for implementation checklists or subtasks, not as the primary Kanban item.

## Architecture Options

### Option A: Keep RoomTask As The Board Item

Pros:

- Already implemented.
- Minimal schema change.

Cons:

- Splits durable execution work from visible Kanban progress.
- Requires two concepts for the same product surface.
- Connector-ingested work items cannot naturally appear in a room board.

### Option B: Add WorkItem.roomId And Use WorkItems For Boards

Pros:

- Aligns with "a room can have one or more workitems."
- Keeps sessions, outcomes, and connector metadata attached to the board card.
- Makes global progress by room easy: group work items by `roomId`.
- Preserves room tasks as optional smaller checklist items.

Cons:

- Requires additive SQLite column and validation.
- Requires room/codebase consistency checks in more routes.

### Option C: Many-To-Many RoomWorkItem Join Table

Pros:

- Supports one work item appearing in multiple rooms.

Cons:

- Adds complexity before a concrete need.
- Makes status ownership ambiguous if multiple rooms show the same work.

Recommended approach: **Option B**. Add `roomId?: string` directly to `WorkItem`. It is simple, matches current product language, and leaves a future join table possible if shared cross-room work becomes real.

## Target Model

```text
Codebase
  -> Room
      -> RoomAgent
      -> RoomMessage
      -> WorkItem
          -> RoomTask
          -> Session
              -> SessionEvent
              -> Outcome
```

Key rules:

- `Room.codebaseId` is authoritative for room scope.
- `WorkItem.roomId`, when present, must point to a room with the same `codebaseId`.
- `Session.roomId`, when created from a work item, should default to `WorkItem.roomId`.
- `RoomTask.workItemId`, when present, must point to a work item in the same room/codebase.
- The room Kanban board is built from `WorkItem.status`.
- The global work board groups work items by room, with an "Unassigned" group for work without `roomId`.
- Humans steer agents through `RoomMessage` and can also edit files directly in the runtime workspace outside automomo.

## Task 1: Add Room Scope To WorkItem Protocol

**Files:**

- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/protocol/test/schemas.test.ts`

**Goal:** Make room membership part of the public work item contract.
**Criteria:** Protocol schemas parse room-scoped work items, list queries accept `roomId`, and invalid room identifiers are rejected.

- [ ] Step 1: Write failing protocol tests.

  Add this case to `packages/protocol/test/schemas.test.ts`:

  ```ts
  it("models room-scoped work items and room work filters", async () => {
    const protocol = await import("../src/index");

    const workItem = protocol.WorkItemSchema.parse({
      id: "work_1",
      codebaseId: "codebase_1",
      roomId: "room_1",
      title: "Build room board",
      createdAt: now,
      updatedAt: now
    });
    const query = protocol.WorkItemListQuerySchema.parse({
      codebaseId: "codebase_1",
      roomId: "room_1",
      status: "ready"
    });
    const upsert = protocol.WorkItemUpsertRequestSchema.parse({
      codebaseId: "codebase_1",
      roomId: "room_1",
      connector: { type: "manual", id: "room-work-1", metadata: {} },
      title: "Seed room work"
    });

    expect(workItem.roomId).toBe("room_1");
    expect(query.roomId).toBe("room_1");
    expect(upsert.roomId).toBe("room_1");
    expect(() =>
      protocol.WorkItemSchema.parse({
        id: "work_2",
        codebaseId: "codebase_1",
        roomId: "",
        title: "Invalid room",
        createdAt: now,
        updatedAt: now
      })
    ).toThrow();
  });
  ```

- [ ] Step 2: Verify the test fails.

  Run: `pnpm --filter @automomo/protocol test`

  Expected: FAIL because `roomId` is not in `WorkItemSchema`, `WorkItemListQuerySchema`, or `WorkItemUpsertRequestSchema`.

- [ ] Step 3: Add protocol fields.

  Apply these schema changes in `packages/protocol/src/index.ts`:

  ```ts
  export const WorkItemSchema = z.object({
    id: IdSchema,
    codebaseId: IdSchema,
    roomId: IdSchema.optional(),
    title: z.string().trim().min(1),
    body: z.string().default(""),
    source: WorkItemSourceSchema.default("manual"),
    status: WorkItemStatusSchema.default("open"),
    priority: PrioritySchema.default("medium"),
    labels: z.array(z.string().trim().min(1)).default([]),
    connector: ConnectorRefSchema.optional(),
    metadata: MetadataSchema,
    createdAt: ISODateString,
    updatedAt: ISODateString
  });
  ```

  Add `roomId` to `WorkItemListQuerySchema`:

  ```ts
  roomId: IdSchema.optional(),
  ```

  Add `roomId` to `WorkItemUpsertRequestSchema`:

  ```ts
  roomId: IdSchema.optional(),
  ```

- [ ] Step 4: Verify protocol tests pass.

  Run: `pnpm --filter @automomo/protocol test`

  Expected: PASS.

- [ ] Step 5: Commit.

  ```bash
  git add packages/protocol/src/index.ts packages/protocol/test/schemas.test.ts
  git commit -m "feat: add room scope to work item protocol"
  ```

## Task 2: Persist And Filter WorkItem.roomId

**Files:**

- Modify: `apps/api/src/schema.ts`
- Modify: `apps/api/src/store.ts`
- Modify: `apps/api/src/filters.ts`
- Modify: `apps/api/test/filters-overview.test.ts`

**Goal:** Store `roomId` in memory and SQLite, and allow work item lists to be filtered by room.
**Criteria:** MemoryStore and SQLiteStore both round-trip `roomId`; `/api/work-items?roomId=...` returns only matching work.

- [ ] Step 1: Write failing filter/persistence tests.

  Extend the first test in `apps/api/test/filters-overview.test.ts` by creating two rooms and assigning one work item to each:

  ```ts
  await app.request("/api/rooms", json({ id: "room_1", codebaseId: "codebase_1", name: "Runtime room" }));
  await app.request("/api/rooms", json({ id: "room_2", codebaseId: "codebase_1", name: "UI room" }));
  ```

  Change the first work item creation to include `roomId: "room_1"` and the second to include `roomId: "room_2"`.

  Add this assertion:

  ```ts
  const roomFiltered = await app.request("/api/work-items?roomId=room_2");
  const roomPayload = (await roomFiltered.json()) as { items: Array<{ id: string; roomId?: string }> };
  expect(roomPayload.items).toEqual([expect.objectContaining({ id: "work_a", roomId: "room_2" })]);
  ```

- [ ] Step 2: Verify the test fails.

  Run: `pnpm --filter @automomo/api test -- filters-overview.test.ts`

  Expected: FAIL because `roomId` is ignored by persistence and filters.

- [ ] Step 3: Add SQLite column definition.

  In `apps/api/src/schema.ts`, add `roomId` to `workItems`:

  ```ts
  roomId: text("room_id"),
  ```

  Place it after `codebaseId`.

- [ ] Step 4: Add filter parsing.

  In `apps/api/src/filters.ts`, add `"roomId"` to `knownWorkItemFilters` immediately after `"codebaseId"`.

- [ ] Step 5: Add MemoryStore and SQLiteStore persistence.

  In `apps/api/src/store.ts`:

  - Add `roomId: parsed.roomId` to `SQLiteStore.saveWorkItem().values`.
  - Add `roomId: parsed.roomId` to `SQLiteStore.saveWorkItem().onConflictDoUpdate.set`.
  - Add `room_id TEXT,` to the `CREATE TABLE IF NOT EXISTS work_items` DDL immediately after `codebase_id TEXT NOT NULL,`.
  - Add this migration guard after the existing `sessions.room_id` guard:

    ```ts
    addColumnIfMissing(this.sqlite, "work_items", "room_id", "TEXT");
    ```

  - Add `roomId: row.roomId ?? undefined` to `rowToWorkItem()`.
  - Add this filter line inside `filterWorkItems()` after codebase filtering:

    ```ts
    if (query.roomId && item.roomId !== query.roomId) return false;
    ```

- [ ] Step 6: Verify API filter test passes.

  Run: `pnpm --filter @automomo/api test -- filters-overview.test.ts`

  Expected: PASS.

- [ ] Step 7: Commit.

  ```bash
  git add apps/api/src/schema.ts apps/api/src/store.ts apps/api/src/filters.ts apps/api/test/filters-overview.test.ts
  git commit -m "feat: persist room scoped work items"
  ```

## Task 3: Validate Room-Scoped Work Item API

**Files:**

- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/app.test.ts`

**Goal:** Let callers create work items directly in a room and prevent room/codebase mismatches.
**Criteria:** `/api/work-items` validates `roomId`; `/api/rooms/:id/work-items` lists and creates room work; cross-codebase room/work combinations return `409`.

- [ ] Step 1: Write failing API tests.

  Add this test to `apps/api/test/app.test.ts`:

  ```ts
  it("creates and lists work items through a room while preserving codebase boundaries", async () => {
    const store = new MemoryStore();
    const app = createApp({ store, now: () => new Date(now) });

    await app.request("/api/codebases", json({ id: "codebase_1", name: "automomo", provider: "git" }));
    await app.request("/api/codebases", json({ id: "codebase_2", name: "sidecar", provider: "git" }));
    await app.request("/api/rooms", json({ id: "room_1", codebaseId: "codebase_1", name: "Runtime room" }));
    await app.request("/api/rooms", json({ id: "room_2", codebaseId: "codebase_2", name: "Foreign room" }));

    const nestedCreate = await app.request(
      "/api/rooms/room_1/work-items",
      json({ id: "work_room_1", title: "Build room board", labels: ["ui"], priority: "high" })
    );
    expect(nestedCreate.status).toBe(201);
    const nestedPayload = (await nestedCreate.json()) as { workItem: { codebaseId: string; roomId?: string } };
    expect(nestedPayload.workItem).toMatchObject({ codebaseId: "codebase_1", roomId: "room_1" });

    const directCreate = await app.request(
      "/api/work-items",
      json({ id: "work_room_2", codebaseId: "codebase_1", roomId: "room_1", title: "Direct room work" })
    );
    expect(directCreate.status).toBe(201);

    const mismatch = await app.request(
      "/api/work-items",
      json({ id: "work_bad", codebaseId: "codebase_1", roomId: "room_2", title: "Bad room work" })
    );
    expect(mismatch.status).toBe(409);

    const roomItems = await app.request("/api/rooms/room_1/work-items");
    const roomItemsPayload = (await roomItems.json()) as { workItems: Array<{ id: string; roomId?: string }> };
    expect(roomItemsPayload.workItems.map((item) => item.id)).toEqual(["work_room_1", "work_room_2"]);
    expect(roomItemsPayload.workItems.every((item) => item.roomId === "room_1")).toBe(true);
  });
  ```

- [ ] Step 2: Verify the API test fails.

  Run: `pnpm --filter @automomo/api test -- app.test.ts`

  Expected: FAIL because `/api/rooms/:id/work-items` does not exist and `/api/work-items` does not validate `roomId`.

- [ ] Step 3: Update `/api/work-items` validation.

  In `app.post("/api/work-items")`, after parsing body and before authorization:

  ```ts
  const room = body.roomId ? store.getRoom(body.roomId) : undefined;
  if (body.roomId && !room) {
    return c.json({ error: "room not found" }, 404);
  }
  if (room && room.codebaseId !== body.codebaseId) {
    return c.json({ error: "room does not belong to work item codebase" }, 409);
  }
  ```

  Add `roomId: body.roomId` to the `store.saveWorkItem()` payload.

- [ ] Step 4: Add room-scoped work item routes.

  Add these routes in `apps/api/src/app.ts` after the room task routes:

  ```ts
  app.get("/api/rooms/:id/work-items", (c) => {
    const room = store.getRoom(c.req.param("id"));
    if (!room) {
      return c.json({ error: "room not found" }, 404);
    }
    const response = store.listWorkItems({
      codebaseId: room.codebaseId,
      roomId: room.id,
      limit: 50,
      offset: 0
    });
    return c.json({ ...response, workItems: response.items });
  });

  app.post("/api/rooms/:id/work-items", async (c) => {
    const room = store.getRoom(c.req.param("id"));
    if (!room) {
      return c.json({ error: "room not found" }, 404);
    }
    const auth = await requireWriteAccess(c.req.raw.headers, "work_items:write", room.codebaseId, requireApiKey, store, bootstrapToken);
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const body = await parseJson(c.req, createWorkItemBody.partial({ codebaseId: true, roomId: true }));
    if (body.codebaseId && body.codebaseId !== room.codebaseId) {
      return c.json({ error: "work item codebase does not match room codebase" }, 409);
    }
    const timestamp = now();
    const item = store.saveWorkItem({
      id: body.id ?? randomId("work"),
      codebaseId: room.codebaseId,
      roomId: room.id,
      title: body.title,
      body: body.body ?? "",
      source: body.source ?? "manual",
      status: body.status ?? "open",
      priority: body.priority ?? "medium",
      labels: body.labels ?? [],
      connector: body.connector,
      metadata: body.metadata ?? {},
      createdAt: body.createdAt ?? timestamp,
      updatedAt: body.updatedAt ?? timestamp
    });
    audit(store, {
      actorType: auth.apiKey ? "api_key" : "system",
      actorId: auth.apiKey?.id,
      action: "room.work_item.create",
      targetType: "work_item",
      targetId: item.id,
      metadata: { roomId: room.id },
      createdAt: timestamp
    });
    return c.json({ workItem: item }, 201);
  });
  ```

- [ ] Step 5: Verify room work API tests pass.

  Run: `pnpm --filter @automomo/api test -- app.test.ts`

  Expected: PASS.

- [ ] Step 6: Commit.

  ```bash
  git add apps/api/src/app.ts apps/api/test/app.test.ts
  git commit -m "feat: add room scoped work item routes"
  ```

## Task 4: Propagate WorkItem.roomId Into Sessions And Ingress

**Files:**

- Modify: `apps/api/src/sessions/start.ts`
- Modify: `apps/api/src/work-items/upsert.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/app.test.ts`
- Modify: `packages/protocol/test/schemas.test.ts`

**Goal:** Sessions started from room work preserve room context automatically.
**Criteria:** Creating or starting a room-scoped work item yields a session with the same `roomId`; upsert can carry `roomId` and rejects mismatched room/codebase pairs.

- [ ] Step 1: Write failing session propagation test.

  Extend `apps/api/test/app.test.ts` with:

  ```ts
  it("starts sessions with room context inherited from work items", async () => {
    const store = new MemoryStore();
    const app = createApp({ store, now: () => new Date(now) });

    await app.request("/api/codebases", json({ id: "codebase_1", name: "automomo", provider: "git" }));
    await app.request("/api/rooms", json({ id: "room_1", codebaseId: "codebase_1", name: "Runtime room" }));
    await app.request("/api/agents", json({ id: "agent_1", name: "Ralph" }));
    await app.request("/api/runtimes", json({ id: "runtime_1", name: "Local Pi", mode: "local", provider: "pi" }));
    await app.request(
      "/api/orchestration-rules",
      json({
        id: "rule_1",
        codebaseId: "codebase_1",
        name: "Manual room work",
        trigger: "manual",
        match: { labels: ["room"] },
        agentId: "agent_1",
        runtimeId: "runtime_1"
      })
    );
    await app.request(
      "/api/work-items",
      json({
        id: "work_1",
        codebaseId: "codebase_1",
        roomId: "room_1",
        title: "Room-scoped session",
        labels: ["room"]
      })
    );

    const start = await app.request("/api/work-items/work_1/start", json({ trigger: "manual" }));
    expect(start.status).toBe(200);
    const payload = (await start.json()) as { session?: { roomId?: string } };
    expect(payload.session?.roomId).toBe("room_1");
  });
  ```

- [ ] Step 2: Verify the test fails.

  Run: `pnpm --filter @automomo/api test -- app.test.ts`

  Expected: FAIL because `startSessionFromWorkItem()` does not set `roomId`.

- [ ] Step 3: Propagate `roomId` in session start.

  In `apps/api/src/sessions/start.ts`, add this field to the `store.saveSession()` payload:

  ```ts
  roomId: workItem.roomId,
  ```

- [ ] Step 4: Validate manual session creation against work item room.

  In `app.post("/api/sessions")`, after loading `workItem`, add:

  ```ts
  if (workItem.roomId && body.roomId && workItem.roomId !== body.roomId) {
    return c.json({ error: "work item room does not match session room" }, 409);
  }
  ```

  Then set the session room as:

  ```ts
  roomId: body.roomId ?? workItem?.roomId ?? room?.id,
  ```

- [ ] Step 5: Add `roomId` to source upsert.

  In `apps/api/src/work-items/upsert.ts`:

  - Validate `input.request.roomId` when present.
  - Reject a room whose `codebaseId` does not equal `input.request.codebaseId`.
  - Preserve existing room assignment when an incoming upsert omits `roomId`.
  - Save `roomId: input.request.roomId ?? existing?.roomId`.

  Use this validation block:

  ```ts
  const room = input.request.roomId ? input.store.getRoom(input.request.roomId) : undefined;
  if (input.request.roomId && !room) {
    throw new Error(`unknown room ${input.request.roomId}`);
  }
  if (room && room.codebaseId !== input.request.codebaseId) {
    throw new Error(`room ${room.id} does not belong to codebase ${input.request.codebaseId}`);
  }
  ```

- [ ] Step 6: Verify API tests pass.

  Run: `pnpm --filter @automomo/api test -- app.test.ts`

  Expected: PASS.

- [ ] Step 7: Commit.

  ```bash
  git add apps/api/src/sessions/start.ts apps/api/src/work-items/upsert.ts apps/api/src/app.ts apps/api/test/app.test.ts packages/protocol/test/schemas.test.ts
  git commit -m "feat: propagate room context into sessions"
  ```

## Task 5: Add Web API Helpers And Mock Room Work

**Files:**

- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/api.test.ts`
- Modify: `apps/web/src/lib/mock-data.ts`

**Goal:** Make web surfaces able to fetch and create work items scoped to a room.
**Criteria:** Web API client supports room-scoped work item list/create helpers, and mock work items include room assignments.

- [ ] Step 1: Write failing web API client tests.

  Extend `apps/web/src/lib/api.test.ts`:

  ```ts
  if (url.endsWith("/api/rooms/room_1/work-items")) {
    return Response.json({ workItems: [], items: [], page: { limit: 50, offset: 0, total: 0 } });
  }
  ```

  Add assertions:

  ```ts
  await expect(client.listRoomWorkItems("room_1")).resolves.toMatchObject({ items: [], page: { total: 0 } });
  ```

  In the write payload test, add:

  ```ts
  if (String(input).endsWith("/api/rooms/room_1/work-items")) {
    return Response.json({
      workItem: {
        id: "work_1",
        codebaseId: "codebase_1",
        roomId: "room_1",
        title: "Room work",
        body: "",
        source: "manual",
        status: "open",
        priority: "medium",
        labels: [],
        metadata: {},
        createdAt: now,
        updatedAt: now
      }
    });
  }
  ```

  Then call:

  ```ts
  await client.createRoomWorkItem("room_1", { title: "Room work" });
  ```

- [ ] Step 2: Verify the web API test fails.

  Run: `pnpm --filter @automomo/web test -- api.test.ts`

  Expected: FAIL because the helper methods do not exist.

- [ ] Step 3: Add API client methods.

  In `apps/web/src/lib/api.ts`, add:

  ```ts
  async listRoomWorkItems(roomId: string) {
    return WorkItemListResponseSchema.parse(await get(`/api/rooms/${roomId}/work-items`));
  },
  async createRoomWorkItem(roomId: string, body: Record<string, unknown>) {
    const payload = (await post(`/api/rooms/${roomId}/work-items`, body)) as { workItem: unknown };
    return WorkItemSchema.parse(payload.workItem);
  },
  ```

  Add `WorkItemSchema` to the imports.

- [ ] Step 4: Update mock data.

  In `apps/web/src/lib/mock-data.ts`, add `roomId` to existing work items:

  ```ts
  roomId: "room_shared",
  ```

  for `work_1042` and `work_987`, and:

  ```ts
  roomId: "room_handoff",
  ```

  for `work_291`.

- [ ] Step 5: Verify web API tests pass.

  Run: `pnpm --filter @automomo/web test -- api.test.ts`

  Expected: PASS.

- [ ] Step 6: Commit.

  ```bash
  git add apps/web/src/lib/api.ts apps/web/src/lib/api.test.ts apps/web/src/lib/mock-data.ts
  git commit -m "feat: add room work item web client"
  ```

## Task 6: Render Room Boards From WorkItems

**Files:**

- Modify: `apps/web/src/app/rooms/page.tsx`
- Modify: `apps/web/src/app/rooms/page.test.tsx`

**Goal:** Make the room page show room-scoped work item progress as the primary Kanban surface.
**Criteria:** `/rooms` renders room work counts, status lanes, and recent room messages; room tasks are rendered as subtasks/checklist work rather than the main board.

- [ ] Step 1: Write failing Rooms page test.

  Update the mocked API in `apps/web/src/app/rooms/page.test.tsx` with:

  ```ts
  listRoomWorkItems: async () => ({
    items: [
      {
        id: "work_1",
        codebaseId: "codebase_1",
        roomId: "room_1",
        title: "Investigate room flow",
        body: "Use work items as room board cards.",
        source: "manual",
        status: "ready",
        priority: "medium",
        labels: ["room"],
        metadata: {},
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:00:00.000Z"
      }
    ],
    page: { limit: 50, offset: 0, total: 1 }
  }),
  ```

  Add assertions:

  ```ts
  expect(html).toContain("Room work");
  expect(html).toContain("Investigate room flow");
  expect(html).toContain("ready");
  expect(html).toContain("1 work item");
  ```

- [ ] Step 2: Verify the Rooms page test fails.

  Run: `pnpm --filter @automomo/web test -- page.test.tsx`

  Expected: FAIL because the page does not call `listRoomWorkItems()` or render a "Room work" board.

- [ ] Step 3: Fetch room work items.

  In `apps/web/src/app/rooms/page.tsx`, update the second `Promise.all` to include:

  ```ts
  Promise.all(roomList.map((room) => api.listRoomWorkItems(room.id)))
  ```

  Create:

  ```ts
  const roomWorkItemsByRoom = new Map(roomList.map((room, index) => [room.id, roomWorkItems[index]?.items ?? []]));
  const allRoomWorkItems = [...roomWorkItems.flatMap((response) => response.items)];
  ```

- [ ] Step 4: Update room rows.

  Replace the current room row "Recent" meta value with work item count:

  ```ts
  const work = roomWorkItemsByRoom.get(room.id) ?? [];
  ```

  Use:

  ```ts
  {
    label: "Work",
    value: `${work.length} work item${work.length === 1 ? "" : "s"}`,
    caption: work[0]?.title ?? "none"
  }
  ```

- [ ] Step 5: Add the room work board section.

  Add a `DataRows` section before "Recent messages":

  ```tsx
  <DataRows title="Room work" count={allRoomWorkItems.length}>
    {allRoomWorkItems.length === 0 ? <EmptyState title="No room work" body="Work items assigned to rooms will appear here." /> : null}
    {allRoomWorkItems.map((item) => {
      const room = roomList.find((candidate) => candidate.id === item.roomId);
      return (
        <DataRow
          key={item.id}
          tone={item.status === "needs_human" ? "yellow" : item.status === "completed" ? "green" : "grey"}
          title={item.title}
          subtitle={item.body}
          code={item.id.toUpperCase()}
          status={item.status}
          meta={[
            { label: "Room", value: room?.name ?? item.roomId ?? "Unassigned", caption: item.priority },
            { label: "Labels", value: item.labels.join(", ") || "none", caption: item.source }
          ]}
          action="Start"
        />
      );
    })}
  </DataRows>
  ```

- [ ] Step 6: Keep room tasks as subtasks.

  Rename the existing "Room tasks" section to:

  ```tsx
  <DataRows title="Room subtasks" count={recentTasks.length}>
  ```

  Update empty copy to:

  ```tsx
  <EmptyState title="No room subtasks" body="Small checklist tasks can be linked to room work items." />
  ```

- [ ] Step 7: Verify Rooms page tests pass.

  Run: `pnpm --filter @automomo/web test -- page.test.tsx`

  Expected: PASS.

- [ ] Step 8: Commit.

  ```bash
  git add apps/web/src/app/rooms/page.tsx apps/web/src/app/rooms/page.test.tsx
  git commit -m "feat: render room work board"
  ```

## Task 7: Render Global Work Progress Grouped By Room

**Files:**

- Modify: `apps/web/src/app/work-items/page.tsx`
- Create: `apps/web/src/app/work-items/page.test.tsx`

**Goal:** Let operators see all work globally while preserving each room's progress context.
**Criteria:** Work Items page groups rows by room name and shows an "Unassigned" group for work without a room.

- [ ] Step 1: Write failing Work Items page test.

  Create `apps/web/src/app/work-items/page.test.tsx`:

  ```ts
  import React from "react";
  import { renderToStaticMarkup } from "react-dom/server";
  import { describe, expect, it, vi } from "vitest";

  vi.mock("../../lib/api", () => ({
    getApiClient: () => ({
      getOverview: async () => ({
        counts: { codebases: 1, workItems: 2, sessions: 0, agents: 0, runtimes: 0 },
        runtimeHealth: { idle: 0, online: 0, offline: 0, busy: 0, unhealthy: 0 },
        handoffCount: 0,
        daemonCount: 0,
        activeSessionCount: 0,
        recentEvents: []
      }),
      listRooms: async () => ({
        items: [
          {
            id: "room_1",
            codebaseId: "codebase_1",
            name: "Runtime room",
            description: "",
            status: "active",
            metadata: {},
            createdAt: "2026-04-20T08:00:00.000Z",
            updatedAt: "2026-04-20T08:00:00.000Z"
          }
        ],
        page: { limit: 50, offset: 0, total: 1 }
      }),
      listWorkItems: async () => ({
        items: [
          {
            id: "work_1",
            codebaseId: "codebase_1",
            roomId: "room_1",
            title: "Room work",
            body: "Grouped under runtime room.",
            source: "manual",
            status: "ready",
            priority: "medium",
            labels: [],
            metadata: {},
            createdAt: "2026-04-20T08:00:00.000Z",
            updatedAt: "2026-04-20T08:00:00.000Z"
          },
          {
            id: "work_2",
            codebaseId: "codebase_1",
            title: "Global work",
            body: "No room yet.",
            source: "manual",
            status: "open",
            priority: "low",
            labels: [],
            metadata: {},
            createdAt: "2026-04-20T08:00:00.000Z",
            updatedAt: "2026-04-20T08:00:00.000Z"
          }
        ],
        page: { limit: 50, offset: 0, total: 2 }
      })
    })
  }));

  describe("Work Items page", () => {
    it("groups global work by room", async () => {
      const { default: WorkItemsPage } = await import("./page");
      const html = renderToStaticMarkup(await WorkItemsPage());

      expect(html).toContain("Runtime room");
      expect(html).toContain("Unassigned");
      expect(html).toContain("Room work");
      expect(html).toContain("Global work");
    });
  });
  ```

- [ ] Step 2: Verify the page test fails.

  Run: `pnpm --filter @automomo/web test -- work-items/page.test.tsx`

  Expected: FAIL because `WorkItemsPage` does not call `listRooms()` or group rows.

- [ ] Step 3: Fetch rooms on the Work Items page.

  In `apps/web/src/app/work-items/page.tsx`, change:

  ```ts
  const [overview, workItems] = await Promise.all([api.getOverview(), api.listWorkItems()]);
  ```

  to:

  ```ts
  const [overview, workItems, rooms] = await Promise.all([api.getOverview(), api.listWorkItems(), api.listRooms()]);
  ```

- [ ] Step 4: Group work by room.

  Add this helper at the bottom of `page.tsx`:

  ```ts
  function groupWorkByRoom(
    items: { roomId?: string }[],
    rooms: { id: string; name: string }[]
  ) {
    const roomNames = new Map(rooms.map((room) => [room.id, room.name]));
    const groups = new Map<string, { title: string; items: typeof items }>();
    for (const item of items) {
      const key = item.roomId ?? "unassigned";
      const title = item.roomId ? (roomNames.get(item.roomId) ?? item.roomId) : "Unassigned";
      const existing = groups.get(key) ?? { title, items: [] };
      existing.items.push(item);
      groups.set(key, existing);
    }
    return [...groups.values()];
  }
  ```

  Replace the single `DataRows title="Current items"` section with one `DataRows` per group.

- [ ] Step 5: Verify Work Items page tests pass.

  Run: `pnpm --filter @automomo/web test -- work-items/page.test.tsx`

  Expected: PASS.

- [ ] Step 6: Commit.

  ```bash
  git add apps/web/src/app/work-items/page.tsx apps/web/src/app/work-items/page.test.tsx
  git commit -m "feat: group global work by room"
  ```

## Task 8: Update Architecture Docs For Human Steering And Self-Hosted Experiment

**Files:**

- Modify: `docs/architecture/rooms.md`
- Modify: `docs/architecture/overview.md`
- Create: `docs/architecture/self-hosted-experiment.md`

**Goal:** Make the intended product model explicit before deeper agent orchestration work begins.
**Criteria:** Docs say rooms own collaboration, work items power boards, humans steer by messages or direct runtime edits, and this repo can later be used as an automomo experiment codebase.

- [ ] Step 1: Update `docs/architecture/rooms.md`.

  Replace the `Model` section with:

  ```markdown
  ## Model

  - A `Room` belongs to a codebase.
  - A `RoomAgent` joins an agent to a room.
  - A `RoomMessage` records human, agent, or system authorship.
  - A `WorkItem` can belong to a room through `roomId`; these work items are the primary room board cards.
  - A `RoomTask` tracks smaller room-local checklist work and can optionally point at a work item.
  - A `Session` can carry both `roomId` and `workItemId`, preserving the room context while a runtime executes durable work.
  ```

  Add:

  ```markdown
  ## Human Steering

  Humans steer agents by sending room messages, changing work item status or assignment, approving handoffs, or editing files directly in the runtime workspace. The UI should avoid pretending that every intervention is a button-driven workflow; file edits in the runtime are a valid collaboration path.
  ```

- [ ] Step 2: Update `docs/architecture/overview.md`.

  Change the system shape to:

  ```text
  external event or human intent
    -> room message or work item
    -> room-scoped work board
    -> session on a reusable runtime
    -> human and agent events
    -> structured outcome
  ```

- [ ] Step 3: Create `docs/architecture/self-hosted-experiment.md`.

  Add:

  ```markdown
  # Self-Hosted automomo Experiment

  Date: 2026-04-21

  The automomo repository can later become the first real experiment codebase for automomo itself.

  ## Experiment Shape

  ```text
  automomo codebase
    -> automomo development room
        -> room-scoped work items
        -> agents assigned to the room
        -> local machine runtime pointing at this repo
        -> humans steer through messages or direct file edits
        -> sessions produce events and outcomes
  ```

  ## Success Questions

  - Can room messages carry enough intent for agents to coordinate?
  - Do room-scoped work items make progress clear from both room and global views?
  - Does the local runtime preserve enough repository context?
  - Can humans steer mostly through messages and file edits instead of complex controls?
  - Do handoffs, events, and outcomes provide enough audit trail for codebase work?

  ## First Experiment Setup

  - Codebase: this repository.
  - Room: `automomo development`.
  - Runtime: local Pi runtime with `workspaceRoot` set to this repo.
  - Agents: one planning/review agent and one implementation agent.
  - Work items: small product/API/UI/runtime changes from the automomo backlog.
  ```

- [ ] Step 4: Verify docs are free of old product framing.

  Run: `rg "Auto-Mobile|Pull Requests|review queue" docs/architecture`

  Expected: no output.

- [ ] Step 5: Commit.

  ```bash
  git add docs/architecture/rooms.md docs/architecture/overview.md docs/architecture/self-hosted-experiment.md
  git commit -m "docs: describe room scoped work model"
  ```

## Task 9: Final Verification And PR Update

**Files:**

- No source files modified unless verification finds a defect.

**Goal:** Prove the room-scoped work model is stable across packages.
**Criteria:** Test, typecheck, lint, build, and whitespace checks pass.

- [ ] Step 1: Run the full test suite.

  Run: `pnpm test`

  Expected: PASS.

- [ ] Step 2: Run typecheck.

  Run: `pnpm typecheck`

  Expected: PASS.

- [ ] Step 3: Run lint.

  Run: `pnpm lint`

  Expected: PASS.

- [ ] Step 4: Run production build.

  Run: `pnpm build`

  Expected: PASS.

- [ ] Step 5: Run diff whitespace check.

  Run: `git diff --check`

  Expected: PASS with no output.

- [ ] Step 6: Review final changed files.

  Run:

  ```bash
  git status --short
  git diff --stat
  ```

  Expected: only files from this plan are modified or newly created.

- [ ] Step 7: Push and update the PR.

  Run:

  ```bash
  git push
  gh pr edit 1 --body "$(cat <<'EOF'
  ## Summary
  - Add roomId to work items so rooms can own one or more durable work cards.
  - Add room-scoped work item filtering, creation, persistence, and session propagation.
  - Render room boards from work items and global work progress grouped by room.
  - Document human steering and the future self-hosted automomo experiment.

  ## Test Plan
  - pnpm test
  - pnpm typecheck
  - pnpm lint
  - pnpm build
  - git diff --check
  EOF
  )"
  ```

  Expected: branch pushed and PR description updated.

## Acceptance Criteria

- `WorkItem.roomId` is part of protocol, persistence, API responses, API filters, web client types, and mock data.
- Creating a work item with `roomId` validates that the room exists and belongs to the same codebase.
- Creating work through `/api/rooms/:id/work-items` assigns both `codebaseId` and `roomId` from the room.
- Starting a session from a room-scoped work item preserves the room context.
- Room page presents work items as the primary room board.
- Work Items page presents global progress grouped by room.
- Room tasks remain available as subtasks, not the main Kanban entity.
- Docs explain that humans steer agents through messages, direct runtime file edits, assignment/status changes, and handoff decisions.
- Docs explain how this repo can later be used as an automomo self-hosted experiment.

## Self-Review

Spec coverage:

- Room can have one or more work items: covered by Tasks 1 through 6.
- Kanban board is room-scoped: covered by Task 6.
- Global perspective shows task progress for each room: covered by Task 7.
- Humans steer agents by messages or direct runtime file edits: covered by Task 8.
- Current repo can later become an experiment: covered by Task 8.

Placeholder scan:

- This plan contains no undefined file paths.
- Every task lists exact files and exact verification commands.
- Each implementation step specifies concrete schema, route, persistence, UI, or documentation edits.

Type consistency:

- `roomId` is consistently optional on `WorkItem`, `WorkItemListQuery`, `WorkItemUpsertRequest`, and `Session`.
- `RoomTask.workItemId` remains optional and points at `WorkItem.id`.
- Existing `Room.id`, `Session.roomId`, and `WorkItem.roomId` all use `IdSchema`.

Dependency order:

- Protocol lands first so API and web can import typed fields.
- Persistence lands before routes.
- Routes land before web client helpers.
- Web client helpers land before page rendering.
- Docs land after the final model is settled.

