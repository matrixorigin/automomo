# automomo

`automomo` is an Oz-first room workspace where humans and AI agents work together in shared rooms. Rooms hold chat, tasks, artifacts, realtime updates, agent membership, and local runtime activity in one place.

The local daemon provides runtime execution. It registers a runtime with the web app, polls for agent-run leases, runs the Pi runtime adapter against a local workspace, and posts events plus structured outcomes back to the room. Source code is not uploaded by default; your local machine can be the runtime.

## Workspace

- `apps/web` - Oz-derived Next.js room workspace, Prisma database, room APIs, realtime events, and daemon routes.
- `apps/daemon` - user-run local daemon for registering runtimes, claiming leases, running Pi, and reporting outcomes.
- `packages/protocol` - shared Zod schemas and TypeScript types for daemon/runtime payloads.
- `packages/pi-runtime` - Pi Mono runtime adapter boundary.
- `docs/plans` - durable implementation and investigation plans.

`apps/api` remains in the tree as retired legacy source, but it is no longer part of the active pnpm workspace.

## Commands

Install dependencies:

```bash
pnpm install
```

Run the Oz-derived web app:

```bash
pnpm dev
```

Run the local daemon against the web app from the workspace you want agents to use:

```bash
pnpm dev:daemon
```

Validate the active workspace:

```bash
pnpm test
pnpm typecheck
```
