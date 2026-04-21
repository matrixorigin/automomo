import React from "react";
import { TabItem, Tabs } from "./ui/Tabs";

export const roomWorkspaceTabs: TabItem[] = [
  { id: "chat", label: "Chat" },
  { id: "board", label: "Board" },
  { id: "sessions", label: "Sessions" },
  { id: "outcomes", label: "Outcomes" }
];

export type RoomWorkspaceTabId = (typeof roomWorkspaceTabs)[number]["id"];

export function RoomWorkspaceTabs({
  activeTabId,
  onTabChange
}: {
  activeTabId: RoomWorkspaceTabId;
  onTabChange: (tabId: RoomWorkspaceTabId) => void;
}) {
  return <Tabs tabs={roomWorkspaceTabs} activeTabId={activeTabId} onTabChange={(tabId) => onTabChange(tabId as RoomWorkspaceTabId)} ariaLabel="Room workspace tabs" />;
}
