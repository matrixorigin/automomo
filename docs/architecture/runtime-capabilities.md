# Runtime Capabilities

Date: 2026-04-20

Runtime providers expose capabilities explicitly so automomo can decide what the
API, daemon, web UI, and agents are allowed to do with a codebase.

## Capability Flags

- `sourceSync`: provider can clone, fetch, or refresh source.
- `patchUpload`: provider can return patch files or applyable diffs.
- `fileDiff`: provider can compute and upload file diffs.
- `network`: provider can use default, restricted, or disabled networking.
- `secrets`: provider can receive named secret refs without storing values.
- `snapshot`: provider can snapshot a workspace before execution.
- `fork`: provider can create an isolated run workspace.
- `timeout`: provider supports hard execution timeout.
- `resources`: provider supports memory and CPU controls.

## Providers

Shell local runtime:

- Runs a configured command in a prepared workspace.
- Captures stdout/stderr as events.
- Parses a structured JSON outcome from stdout.
- Supports timeout and output limits.

Docker local runtime:

- Assembles a `docker run --rm` command.
- Mounts the prepared workspace at `/workspace`.
- Supports memory, CPU, environment allowlist, and network policy flags.
- Remains optional in tests so Docker is not required for contributors.

Remote daemon runtime:

- Uses signed outbound polling.
- Executes on a user machine.
- Uploads events and outcomes through lease-bound routes.

Hosted runtime:

- Reserved for a future provider that runs outside the local control plane.
- Must still use the same session event and outcome contracts.

Future VM or BoxLite runtime:

- Must implement the same provider interface as shell and Docker.
- Must declare network, snapshot, fork, timeout, secret, and resource support.
- Must preserve structured outcome and redacted event semantics.

## BoxLite Start Criteria

Do not start BoxLite or another VM provider until all of these are true:

- local provider interface is stable in `apps/api/src/runtime`
- shell execution tests cover success, timeout, non-zero, and malformed output
- Docker command assembly and optional execution behavior are tested
- capability flags are rendered in the runtime UI
- daemon and local execution share outcome and event behavior
