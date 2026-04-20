---
id: 002
title: Add work item and session filtering contracts
status: completed
priority: p1
created: 2026-04-20
depends_on: []
tags: [api, protocol, filtering]
plan: docs/plans/2026-04-20-automomo-todo-execution-plans.md#plan-002-add-work-item-and-session-filtering-contracts
---

## Description

Add durable list filtering semantics for the two highest-volume operational views: work items and sessions.

## Acceptance Criteria

- [x] Work item listing supports codebase, source, status, assignee, search query, limit, and offset filters.
- [x] Session listing supports status, codebase, agent, runtime, participant, date range, limit, and offset filters.
- [x] Filter request and response shapes are represented in `packages/protocol`.
- [x] API tests cover accepted filters, ignored unknown filters, and stable pagination ordering.

## Notes

This should be implemented before the UI tables become fully live, otherwise route-level state will be hard to stabilize.
