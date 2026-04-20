---
id: 011
title: Defer Go daemon and BoxLite runtime
status: completed
priority: p3
created: 2026-04-20
depends_on: [005, 008]
tags: [daemon, runtime, deferred]
plan: docs/plans/2026-04-20-automomo-todo-execution-plans.md#plan-011-defer-go-daemon-and-boxlite-runtime
---

## Description

Keep the optional Go daemon and BoxLite/VM runtime out of the immediate build path until the TypeScript daemon, Pi adapter, and local runtime contracts stabilize.

## Acceptance Criteria

- [x] Document the stabilized daemon protocol before starting a Go implementation.
- [x] Document runtime capability flags needed by shell, Docker, and VM providers.
- [x] Revisit BoxLite only after the local runtime provider has a shared interface and tests.
- [x] Revisit the Go daemon only after the TypeScript daemon CLI and identity flow are complete.

## Notes

These are valid future directions, but doing them before the runtime and lease contracts settle would add churn.

Deferred gates are now recorded in `docs/architecture/daemon-protocol.md` and
`docs/architecture/runtime-capabilities.md`.
