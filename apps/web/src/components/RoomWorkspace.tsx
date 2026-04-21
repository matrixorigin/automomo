"use client";

import React, { ReactNode, useState } from "react";
import { roomWorkspaceTabs, RoomWorkspaceTabId, RoomWorkspaceTabs } from "./RoomWorkspaceTabs";

type RoomWorkspacePanelMap = Record<RoomWorkspaceTabId, ReactNode>;

export function RoomWorkspace({
  header,
  contextContent,
  chatContent,
  boardContent,
  sessionsContent,
  outcomesContent
}: {
  header: ReactNode;
  contextContent?: ReactNode;
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
      {contextContent ? <section className="room-workspace-context">{contextContent}</section> : null}
      {roomWorkspaceTabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <section
            key={tab.id}
            className={`room-workspace-panel room-workspace-panel-${tab.id}`}
            role="tabpanel"
            id={`${tab.id}-panel`}
            data-room-tab={tab.id}
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
