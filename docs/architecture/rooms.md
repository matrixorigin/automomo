# Rooms

Date: 2026-04-21

Rooms are automomo's collaboration layer for a codebase. They sit between the
codebase and the runtime execution surfaces, so people and agents can talk,
assign tasks, and keep shared context without collapsing everything into one
session thread.

## Model

- A `Room` belongs to a codebase.
- A `RoomAgent` joins an agent to a room.
- A `RoomMessage` records human, agent, or system authorship.
- A `WorkItem` can belong to a room through `roomId`; these work items are the
  primary room board cards.
- A `RoomTask` tracks smaller room-local checklist work and can optionally point
  at a work item.
- A `Session` can carry both `roomId` and `workItemId`, preserving the room
  context while a runtime executes durable work.

## Human Steering

Humans steer agents by sending room messages, changing work item status or
assignment, approving handoffs, or editing files directly in the runtime
workspace. The UI should avoid pretending that every intervention is a
button-driven workflow; file edits in the runtime are a valid collaboration
path.

## Runtime Connection

Rooms do not replace sessions or runtimes. They frame them.

- Sessions can carry a `roomId`, which preserves the collaboration context when
  a runtime starts work from a room.
- Local runtimes, daemon-backed runtimes, and hosted runtimes all use the same
  session contract, so room context stays visible regardless of where execution
  happens.
- Room tasks can point to a work item, which keeps room discussion connected to
  the broader codebase queue.

## Web And API Surface

- `GET /api/rooms` and `POST /api/rooms` manage rooms.
- `GET /api/rooms/:id/agents` and `POST /api/rooms/:id/agents` manage room
  membership.
- `GET /api/rooms/:id/messages` and `POST /api/rooms/:id/messages` manage room
  conversation history.
- `GET /api/rooms/:id/tasks` and `POST /api/rooms/:id/tasks` manage room-local
  task tracking.
- `GET /api/rooms/:id/work-items` and `POST /api/rooms/:id/work-items` manage
  durable work cards scoped to a room.
- The web app exposes the same concept through the `/rooms` page in the
  Programa-style shell.

## Product Notes

Room membership is intentionally separate from agent identity. An agent can
join multiple rooms, and each room can select different subsets of agents for a
specific work lane. That keeps the collaboration graph flexible without
inventing a new runtime type.
