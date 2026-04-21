"use client";

import type { RoomMessage } from "@automomo/protocol";
import React from "react";
import { RoomChatStream } from "./RoomChatStream";

export function RoomChatComposer({
  roomId,
  agents,
  initialMessages = []
}: {
  roomId: string;
  agents: { id: string; name: string }[];
  initialMessages?: RoomMessage[];
}) {
  return <RoomChatStream roomId={roomId} initialMessages={initialMessages} agentNames={agents.map((agent) => agent.name)} />;
}
