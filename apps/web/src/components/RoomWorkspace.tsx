"use client";

import React, { ReactNode, useState } from "react";
import { roomWorkspaceTabs, RoomWorkspaceTabId, RoomWorkspaceTabs } from "./RoomWorkspaceTabs";

type RoomWorkspacePanelMap = Record<RoomWorkspaceTabId, ReactNode>;

export function RoomWorkspace({
  header,
  chatContent,
  boardContent,
  sessionsContent,
  outcomesContent
}: {
  header: ReactNode;
  chatContent: ReactNode;
  boardContent: ReactNode;
  sessionsContent: ReactNode;
  outcomesContent: ReactNode;
}) {
  const [activeTabId, setActiveTabId] = useState<RoomWorkspaceTabId>("chat");
  const panelByTab: RoomWorkspacePanelMap = {
    chat: chatContent,
    board: boardContent,
    sessions: sessionsContent,
    outcomes: outcomesContent
  };

  return (
    <section className="room-workspace">
      {header}
      <div className="room-workspace-tabs">
        <RoomWorkspaceTabs activeTabId={activeTabId} onTabChange={setActiveTabId} />
      </div>
      {roomWorkspaceTabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <section
            key={tab.id}
            className="room-workspace-panel"
            role="tabpanel"
            id={`${tab.id}-panel`}
            aria-hidden={!isActive}
            hidden={!isActive}
          >
            {panelByTab[tab.id]}
          </section>
        );
      })}
    </section>
  );
}
