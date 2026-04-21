import React from "react";

export function WorkspaceHeader({
  section,
  title,
  action = "New"
}: {
  section: string;
  title: string;
  action?: string;
}) {
  return (
    <header className="topbar">
      <div className="breadcrumbs" aria-label="Breadcrumb">
        <span>Projects</span>
        <span>/</span>
        <span>automomo</span>
        <span>/</span>
        <strong>{section}</strong>
      </div>
      <div className="actions">
        <button className="secondary-action" type="button">
          Filter
        </button>
        <button className="primary-action" type="button">
          {action}
        </button>
      </div>
      <h1>{title}</h1>
    </header>
  );
}
