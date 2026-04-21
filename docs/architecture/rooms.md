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
- A `RoomTask` tracks room-local work and can optionally point at a work item.

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
- The web app exposes the same concept through the `/rooms` page in the
  Programa-style shell.

## Product Notes

Room membership is intentionally separate from agent identity. An agent can
join multiple rooms, and each room can select different subsets of agents for a
specific work lane. That keeps the collaboration graph flexible without
inventing a new runtime type.
