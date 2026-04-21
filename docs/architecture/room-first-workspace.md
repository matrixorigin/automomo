# Room-First Workspace

## Product Frame

automomo is a room-first human/AI workspace for codebase runtimes. The product
experience starts inside shared rooms where people and agents coordinate work,
runtime execution, and outcomes together.

## Core Nouns

- `Room`: collaborative workspace anchored to a codebase runtime context.
- `Work Item`: a scoped unit of execution inside a room.
- `Session`: time-bounded execution trail for work performed by a human or agent.
- `Outcome`: structured result produced from session activity.
- `Agent`: autonomous or semi-autonomous collaborator participating in room work.
- `Runtime`: execution environment that can run room work and report state.

## Room Workspace

The room is the default operating surface. It combines room work lists, session
history, agent participation, runtime status, and outcomes so work can be
planned, executed, and reviewed without leaving the room context.

## Human Steering

Humans steer priorities, approve risky transitions, and resolve handoffs.
Escalations and decision points stay explicit so room execution remains legible
and accountable.

## Agent Participation

Agents operate as active room collaborators. They pick up assigned work,
publish progress through sessions, and produce outcomes that humans can verify
or redirect.

## Runtime Role

Runtimes provide the execution substrate for room work. They register
availability, accept leases/tasks, and emit telemetry and outcomes tied back to
room-level context.

## Internal Orchestration

Control-plane orchestration remains an internal system concern. It coordinates
routing, scheduling, lease handling, and persistence across rooms, agents, and
runtimes without becoming the user-facing product frame.
