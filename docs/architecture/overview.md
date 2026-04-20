# automomo Architecture Overview

`automomo` coordinates humans and AI agents working on codebases through shared
runtimes. GitHub can feed work into the system, but the core product model is
source-neutral.

## System Shape

```text
external event or human intent
  -> work item
  -> orchestration rule or manual assignment
  -> session on a reusable runtime
  -> human and agent events
  -> structured outcome
```

## Boundaries

- `apps/web` renders the Programa-inspired operator workspace.
- `apps/api` owns the control plane: codebases, work items, rules, sessions,
  agents, runtimes, daemon leases, events, and outcomes.
- `apps/daemon` is the user-run connector for remote runtimes. It polls for
  leases, runs the configured runtime, and uploads session metadata/outcomes.
- `packages/protocol` owns shared Zod schemas and TypeScript types.
- `packages/pi-runtime` adapts automomo sessions to Pi Mono-style execution.

## Migration Notes From mo-clawfarm

The previous `mo-clawfarm` code is useful as a pattern library, not as product
vocabulary. Its sandbox provider, executor registry, event timeline, runtime
timeouts, reconnect behavior, and contract tests should inform automomo. Its
GitHub-review-specific queue, repo routes, review result schemas, and old naming
should not be carried forward.
