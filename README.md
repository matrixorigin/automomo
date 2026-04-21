# automomo

`automomo` is a room-first human/AI workspace for codebase runtimes.
Humans and AI agents co-work inside shared rooms through runtime execution,
session timelines, explicit human handoffs, and structured outcomes.

GitHub can be a source of work items, but the core product is not a GitHub issue
or pull request review queue. The main nouns are codebases, work items,
orchestration rules, sessions, agents, runtimes, handoffs, and outcomes.

## Workspace

- `apps/web` - Next.js Programa-aligned operator UI.
- `apps/api` - TypeScript control plane for API routes, daemon leases, events,
  and outcomes.
- `apps/daemon` - user-run TypeScript daemon for remote runtimes.
- `packages/protocol` - shared Zod schemas and TypeScript types.
- `packages/pi-runtime` - Pi Mono-oriented runtime adapter boundary.
- `docs/prototypes/programa-static` - original static visual prototype.

## Commands

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev:web
pnpm dev
```

## Current Implementation Slice

The initial implementation includes:

- Shared protocol schemas for all core product nouns and daemon lease payloads.
- API routes for codebases, work items, orchestration rules, sessions, agents,
  runtimes, human handoffs, daemon registration, heartbeats, leases, event
  uploads, and outcome uploads.
- Drizzle SQLite table definitions matching the product nouns.
- A polling daemon loop that claims a lease, runs the Pi runtime adapter, uploads
  session events, and sends a structured outcome.
- A Next.js UI shell using the Programa-inspired light rail, compact toolbar,
  dense rows, restrained controls, and yellow runtime/handoff accents.

## Design

The visual direction comes from `docs/programa-alignment-spec.md`: white canvas,
thin separators, compact left rail, black primary actions, acid-yellow runtime
and handoff accents, and dense schedule-like rows.
