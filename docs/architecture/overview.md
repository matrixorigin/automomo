# automomo Architecture Overview

`automomo` coordinates humans and AI agents working on codebases through shared
runtimes. GitHub can feed work into the system, but the core product model is
source-neutral.

Rooms are the collaboration layer that sits between codebases and execution.
They group agents, hold messages, and track room-local tasks while preserving
the room context on sessions that run inside local, daemon, or hosted runtimes.

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
  rooms, room memberships, room messages, room tasks, agents, runtimes,
  daemon leases, events, and outcomes.
- `apps/daemon` is the user-run connector for remote runtimes. It polls for
  leases, runs the configured runtime, and uploads session metadata/outcomes.
- `packages/protocol` owns shared Zod schemas and TypeScript types.
- `packages/pi-runtime` adapts automomo sessions to Pi Mono-style execution.

## Rooms And Runtime Context

- A room belongs to a codebase and is the collaboration surface for a selected
  group of agents.
- Room agents are membership records, so the same agent can join multiple
  rooms without changing its runtime identity.
- Room messages can be written by humans, agents, or the system. They provide
  the conversational trail around a piece of work.
- Room tasks can be assigned to an agent and optionally linked to a work item,
  which keeps the room view tied back to codebase work.
- When a session is created with a room id, the session keeps that room
  context so local and daemon runtimes can preserve the shared collaboration
  frame while they execute.
- The runtime abstraction stays broader than one provider. Local, daemon, and
  hosted paths all consume the same session contract, so room context can travel
  with the work regardless of where the agent runs.

## Migration Notes From mo-clawfarm

The previous `mo-clawfarm` code is useful as a pattern library, not as product
vocabulary. Its sandbox provider, executor registry, event timeline, runtime
timeouts, reconnect behavior, and contract tests should inform automomo. Its
GitHub-review-specific queue, repo routes, review result schemas, and old naming
should not be carried forward.
