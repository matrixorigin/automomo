---
id: 005
title: Harden daemon lease protocol and CLI operations
status: completed
priority: p1
created: 2026-04-20
depends_on: []
tags: [daemon, api, reliability, security]
plan: docs/plans/2026-04-20-automomo-todo-execution-plans.md#plan-005-harden-daemon-lease-protocol-and-cli-operations
---

## Description

Turn the daemon proof of flow into a safer remote-runtime protocol with pairing, identity, lease renewal, and operator diagnostics.

## Acceptance Criteria

- [x] Add pairing token registration and persistent daemon identity.
- [x] Require signed daemon requests for lease, events, outcomes, and heartbeat operations.
- [x] Add lease renewal, expiry, reclaim, and explicit failure upload semantics.
- [x] Add daemon CLI commands for `start`, `status`, and `doctor`.
- [x] Decide whether the public route shape is `/api/daemon/*`, `/api/daemons/*`, or both via compatibility aliases.

## Notes

The current daemon e2e test proves polling, events, and outcomes, but it intentionally skips identity hardening.
