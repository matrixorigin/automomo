---
id: 009
title: Add editor workflows and health surfaces
status: completed
priority: p2
created: 2026-04-20
depends_on: [001, 002]
tags: [web, ux, runtimes, agents, rules]
plan: docs/plans/2026-04-20-automomo-todo-execution-plans.md#plan-009-add-editor-workflows-and-health-surfaces
---

## Description

Finish the operational UI beyond read-only tables so users can configure rules, agents, and runtimes and understand runtime health at a glance.

## Acceptance Criteria

- [x] Add create/edit/enable/disable flows for orchestration rules.
- [x] Add agent create/edit flows with default runtime selection.
- [x] Add runtime create/edit flows with capability and health display.
- [x] Surface runtime health, daemon count, active sessions, and human handoffs in the top strip or Overview.
- [x] Add responsive tests or screenshots proving compact controls do not overlap on mobile.

## Notes

Keep controls dense and modest, aligned with the current Programa-inspired interface.
