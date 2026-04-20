---
id: 004
title: Complete session detail, outcome, and handoff flows
status: completed
priority: p1
created: 2026-04-20
depends_on: [001]
tags: [web, api, sessions, handoff]
plan: docs/plans/2026-04-20-automomo-todo-execution-plans.md#plan-004-complete-session-detail-outcome-and-handoff-flows
---

## Description

Make sessions the operational record for human/agent co-work by adding the missing detail view, human controls, and outcome state transitions.

## Acceptance Criteria

- [x] Sessions page includes filters and a detail panel with timeline, participants, runtime, current state, and outcome.
- [x] Human handoff states support pause, request input, claim, resume, approve, reject, and complete semantics.
- [x] Final outcomes update the related work item state.
- [x] Failed sessions preserve error details and event history.
- [x] API and UI tests cover running, failed, completed, and handoff states.

## Notes

The API has a handoff endpoint and event storage, but the product flow is not complete enough for real human intervention.
