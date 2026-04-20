---
id: 010
title: Add security and operations hardening
status: completed
priority: p3
created: 2026-04-20
depends_on: [005, 007]
tags: [security, audit, operations]
plan: docs/plans/2026-04-20-automomo-todo-execution-plans.md#plan-010-add-security-and-operations-hardening
---

## Description

Add the safety features needed before pointing automomo at real codebases with untrusted external events and remote runtimes.

## Acceptance Criteria

- [x] Add codebase-scoped API keys.
- [x] Add audit logs for rule changes, daemon leases, sessions, and human interventions.
- [x] Add rate limits for webhook and daemon endpoints.
- [x] Redact secrets from stored session events and outcomes.
- [x] Add an end-to-end work item to rule to runtime to outcome test with hardening enabled.

## Notes

This is p3 only because the current repo is still proving core behavior. It becomes p1 before any production deployment.
