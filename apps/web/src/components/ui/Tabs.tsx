import React from "react";

export type TabItem = {
  id: string;
  label: string;
  disabled?: boolean;
};

export type TabsProps = Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> & {
  tabs: TabItem[];
  activeTabId: string;
  onTabChange?: (tabId: string) => void;
  ariaLabel: string;
};

export function Tabs({ tabs, activeTabId, onTabChange, ariaLabel, className, ...props }: TabsProps) {
  const classes = ["ui-tabs", className].filter(Boolean).join(" ");
  return (
    <div className={classes} role="tablist" aria-label={ariaLabel} {...props}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`${tab.id}-panel`}
            className={["ui-tab", isActive ? "is-active" : null].filter(Boolean).join(" ")}
            onClick={() => onTabChange?.(tab.id)}
            disabled={tab.disabled}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
