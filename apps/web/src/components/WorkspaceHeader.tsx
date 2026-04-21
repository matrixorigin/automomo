import React from "react";
import Link from "next/link";

export function WorkspaceHeader({
  section,
  title,
  action
}: {
  section: string;
  title: string;
  action?: string | { label: string; href?: string; type?: "button" | "submit" };
}) {
  const resolvedAction = typeof action === "string" ? { label: action } : action;
  return (
    <header className="topbar">
      <div className="breadcrumbs" aria-label="Breadcrumb">
        <span>Projects</span>
        <span>/</span>
        <span>automomo</span>
        <span>/</span>
        <strong>{section}</strong>
      </div>
      {resolvedAction ? (
        <div className="actions">
          {resolvedAction.href ? (
            <Link className="primary-action" href={resolvedAction.href}>
              {resolvedAction.label}
            </Link>
          ) : (
            <button className="primary-action" type={resolvedAction.type ?? "button"}>
              {resolvedAction.label}
            </button>
          )}
        </div>
      ) : null}
      <h1>{title}</h1>
    </header>
  );
}
