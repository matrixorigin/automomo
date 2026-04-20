---
id: 001
title: Wire the web UI to live API data
status: completed
priority: p1
created: 2026-04-20
depends_on: []
tags: [web, api, overview]
plan: docs/plans/2026-04-20-automomo-todo-execution-plans.md#plan-001-wire-web-ui-to-live-api-data
---

## Description

Replace the current mock-only web data path with a typed API client and add the missing Overview API payload so the product shell reflects persisted control-plane state.

## Acceptance Criteria

- [x] Add `GET /api/overview` with counts and status summaries for work items, sessions, handoffs, runtimes, and daemons.
- [x] Add a typed `apps/web/src/lib/api.ts` client that validates responses through `packages/protocol`.
- [x] Overview, Work Items, Sessions, Agents, Runtimes, and Orchestration pages can render from API data.
- [x] Each route has compact empty, loading, and error states that keep the Programa-inspired layout readable.

## Notes

Current UI routes exist, but most pages still render mock data from `apps/web/src/lib/mock-data.ts`.
