# Daemon Protocol

Date: 2026-04-20

automomo keeps the daemon protocol TypeScript-first until runtime contracts stop
moving. The daemon is a user-run connector for remote runtimes; it does not own
orchestration, UI policy, or product vocabulary.

## Route Shape

The public MVP route shape is `/api/daemon/*`. A future `/api/daemons/*` alias
can be added after external clients exist, but the singular route remains the
compatibility surface for this implementation.

## Identity And Signing

`POST /api/daemon/register` pairs a daemon with a runtime and returns:

- a persistent daemon id
- the runtime record
- a shared HMAC secret for follow-up calls

Follow-up daemon calls are signed with `hmac-sha256-v1` headers:

- `x-automomo-daemon-id`
- `x-automomo-runtime-id`
- `x-automomo-timestamp`
- `x-automomo-signature`

The canonical string is:

```text
METHOD
PATH
TIMESTAMP
SHA256(JSON_BODY)
DAEMON_ID
RUNTIME_ID
```

Unsigned, unknown, stale, mismatched-runtime, or invalid-signature daemon calls
are rejected before lease, event, outcome, heartbeat, renew, or failure logic.

## Lease Lifecycle

1. The daemon registers or reuses its runtime.
2. The daemon polls `POST /api/daemon/lease`.
3. The API assigns the next queued session and stores a lease id, daemon id,
   runtime id, session id, expiry, and timestamps.
4. The daemon can renew with `POST /api/daemon/lease/renew`.
5. The daemon uploads session events to `POST /api/daemon/events`.
6. The daemon uploads a structured outcome to `POST /api/daemon/outcome`.
7. A failed runtime can call `POST /api/daemon/fail`.

Closed, failed, completed, expired, mismatched-runtime, and mismatched-daemon
leases are not accepted for event or outcome upload.

## Go Daemon Start Criteria

Do not start a Go daemon until all of these remain stable across at least one
real automomo deployment:

- signed daemon headers and canonical string
- daemon config file shape used by the TypeScript CLI
- `start`, `status`, and `doctor` command semantics
- lease renew/fail/outcome tests
- event and outcome redaction behavior

The Go daemon should remain a narrow connector binary: pair, poll, renew,
execute a configured runtime command, upload events/outcomes, and heartbeat.
