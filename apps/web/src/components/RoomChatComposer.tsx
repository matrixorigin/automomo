"use client";

import type { Agent, RoomMessage } from "@automomo/protocol";
import React from "react";
import { RoomChatStream } from "./RoomChatStream";

export function RoomChatComposer({
  roomId,
  agents,
  initialMessages = []
}: {
  roomId: string;
  agents: Pick<Agent, "id" | "name" | "metadata">[];
  initialMessages?: RoomMessage[];
}) {
  return <RoomChatStream roomId={roomId} initialMessages={initialMessages} agents={agents} />;
}
