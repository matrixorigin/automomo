---
id: 006
title: Replace the Pi runtime stub with a real Pi Mono adapter
status: completed
priority: p1
created: 2026-04-20
depends_on: []
tags: [runtime, pi-mono, agents]
plan: docs/plans/2026-04-20-automomo-todo-execution-plans.md#plan-006-replace-pi-runtime-stub-with-real-pi-mono-adapter
---

## Description

Replace the current metadata-only Pi adapter with a real integration that can start Pi Mono coding-agent sessions and map their event stream into automomo session events.

## Acceptance Criteria

- [x] Add Pi Mono configuration for JSON/RPC or SDK execution mode.
- [x] Pass work item context, orchestration context, codebase instructions, and outcome schema into the Pi session.
- [x] Map Pi event stream entries into typed `SessionEvent` records.
- [x] Decode final Pi output into a typed `Outcome`.
- [x] Preserve malformed output as a decode failure with event trail.

## Notes

The current `packages/pi-runtime` code proves shape only; it does not execute the Pi coding agent yet.
