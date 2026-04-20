---
id: 003
title: Implement orchestration rule evaluation
status: completed
priority: p1
created: 2026-04-20
depends_on: []
tags: [api, orchestration, sessions]
plan: docs/plans/2026-04-20-automomo-todo-execution-plans.md#plan-003-implement-orchestration-rule-evaluation
---

## Description

Move orchestration rules from stored configuration into an executable routing layer that can decide whether work should start automatically, wait for approval, or remain manual.

## Acceptance Criteria

- [x] Implement an evaluator for manual, API/webhook, sync, and scheduled rule types.
- [x] Disabled rules never start sessions.
- [x] Matching rules can route a work item to a resolved agent and runtime.
- [x] Rules can mark a work item as requiring human approval before execution.
- [x] Session start records explain which rule matched and why.

## Notes

Current storage and API shape exist, but rule evaluation and automatic session creation are still missing.
