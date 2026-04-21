import React, { ReactNode } from "react";
import { Badge } from "./ui";

export function RoomHeader({
  roomName,
  roomDescription,
  joinedAgentCount,
  runtimePresence
}: {
  roomName: string;
  roomDescription: string;
  joinedAgentCount: number;
  runtimePresence: ReactNode;
}) {
  return (
    <header className="room-header">
      <div className="room-header-copy">
        <a className="back-link" href="/rooms">
          Rooms
        </a>
        <h1>{roomName}</h1>
        <p>{roomDescription}</p>
      </div>
      <div className="room-header-meta">
        <Badge tone="blue">{joinedAgentCount} agents joined</Badge>
        {runtimePresence}
      </div>
    </header>
  );
}
