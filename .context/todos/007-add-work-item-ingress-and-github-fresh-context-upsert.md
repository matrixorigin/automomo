---
id: 007
title: Add work item ingress and GitHub fresh-context upsert
status: completed
priority: p2
created: 2026-04-20
depends_on: [003]
tags: [connectors, github, work-items]
plan: docs/plans/2026-04-20-automomo-todo-execution-plans.md#plan-007-add-work-item-ingress-and-github-fresh-context-upsert
---

## Description

Build connector-neutral work item creation, then add GitHub as the first external source while keeping GitHub-specific fields in metadata.

## Acceptance Criteria

- [x] Manual UI creation, API creation, and webhook creation share the same work-item creation path.
- [x] GitHub webhook handling fetches fresh issue or pull request context before upsert.
- [x] Duplicate source events dedupe active work items and sessions.
- [x] Unknown codebases are rejected clearly.
- [x] Connector metadata stays outside the core product schema.

## Notes

This should come after the orchestration evaluator so ingress can optionally start sessions.
