# Runtime Decision

Date: 2026-04-20

## Decision

The MVP is TypeScript-first:

- Control plane: TypeScript API.
- Web UI: Next.js.
- Remote daemon MVP: TypeScript.
- Primary agent runtime adapter: Pi Mono.
- Optional hardened connector: small Go daemon later.

## Rationale

The UI, protocol contracts, daemon, and Pi Mono integration are all naturally
TypeScript-shaped. Starting with TypeScript avoids an early cross-language tax
while the core product model is still settling.

The Go daemon remains valuable as a later narrow binary for users who want a
small installable connector. It should only pair/register, poll and lease
sessions, launch a local runtime command, upload events/outcomes, and heartbeat.
It should not own orchestration, prompt composition, schemas, or UI policy.

## Remote Runtime Connection

Remote runtimes use outbound HTTP polling with leases in the MVP. This keeps the
user-run daemon simple and avoids requiring inbound network access to a private
machine. Webhooks, long polling, or a relay can be added later when real usage
shows the need.

## Follow-Up Gates

Detailed gates now live in:

- [Daemon Protocol](./daemon-protocol.md)
- [Runtime Capabilities](./runtime-capabilities.md)

The Go daemon and BoxLite/VM runtime stay deferred until those documents'
criteria are satisfied by the TypeScript daemon, shell/Docker provider surface,
Pi runtime adapter, and runtime UI.
