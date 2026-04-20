import React from "react";

export function EmptyState({ title, body, action }: { title: string; body: string; action?: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{body}</span>
      {action ? <button type="button">{action}</button> : null}
    </div>
  );
}
