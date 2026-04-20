---
id: 008
title: Implement co-located local runtime execution
status: completed
priority: p2
created: 2026-04-20
depends_on: [006]
tags: [runtime, api, local-execution]
plan: docs/plans/2026-04-20-automomo-todo-execution-plans.md#plan-008-implement-co-located-local-runtime-execution
---

## Description

Support the deployment mode where the control plane and runtime live on one machine, without requiring the remote daemon loop.

## Acceptance Criteria

- [x] Add a local runtime provider interface under `apps/api`.
- [x] Prepare repo cache and isolated worktree for a session.
- [x] Support shell and Docker execution modes with basic resource limits.
- [x] Run the selected agent runtime and capture a structured outcome.
- [x] Mark timeout and malformed output failures with event history.

## Notes

The existing e2e test uses this repo as a daemon-accessible workspace. It does not yet implement the API-owned co-located runtime provider.
