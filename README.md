# automomo

`automomo` is a room workspace where humans and AI agents work together against codebase environments. Rooms hold chat, tasks, artifacts, realtime updates, agent membership, and local environment activity in one place.

The local daemon provides environment execution. It registers an environment with the web app, polls for agent-run leases, runs the Pi runtime adapter against a local workspace, and posts events plus structured outcomes back to the room. Source code is not uploaded by default; your local machine can be the environment.

## Workspace

- `apps/web` - Next.js room workspace, Prisma database, room/environment APIs, realtime events, and daemon routes.
- `apps/daemon` - user-run local daemon for registering environments, claiming leases, running Pi, and reporting outcomes.
- `packages/protocol` - shared Zod schemas and TypeScript types for daemon/runtime payloads.
- `packages/pi-runtime` - Pi Mono runtime adapter boundary.
- `docs/plans` - durable implementation and investigation plans.

`apps/api` remains in the tree as retired legacy source, but it is no longer part of the active pnpm workspace.

## Commands

Install dependencies:

```bash
pnpm install
```

Run the web app:

```bash
AUTH_SECRET=automomo-local-dev-secret pnpm dev
```

Run the local daemon against the web app from the workspace you want agents to use:

```bash
pnpm dev:daemon
```

The default daemon environment id is `environment_local`. Override it when needed:

```bash
AUTOMOMO_ENVIRONMENT_ID=environment_local pnpm dev:daemon
```

Build and smoke-check the Docker Pi environment:

```bash
docker compose build automomo-pi-env
docker compose run --rm automomo-pi-env pi --help
```

The Compose service installs `@mariozechner/pi-coding-agent`, exposes the `pi`
CLI, and mounts this repository at `/workspace`.

Validate the active workspace:

```bash
pnpm test
pnpm typecheck
```
