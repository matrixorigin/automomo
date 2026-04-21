import React from "react";
import { ReactNode } from "react";

export function DataRows({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="schedule">
      <div className="floor-heading">
        <h2>
          {title} <span>{count}</span>
        </h2>
      </div>
      {children}
    </section>
  );
}

export function DataRow({
  tone = "grey",
  title,
  subtitle,
  code,
  meta,
  status,
  action = "Details",
  actionHref
}: {
  tone?: "green" | "grey" | "yellow";
  title: string;
  subtitle: string;
  code: string;
  meta: { label: string; value: string; caption: string }[];
  status: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <article className="schedule-row">
      <div className={`asset-thumb thumb-${tone}`} aria-hidden="true">
        <span />
      </div>
      <div className="item-main">
        <strong>{title}</strong>
        <small>{subtitle}</small>
        <span>{code}</span>
      </div>
      {meta.map((item) => (
        <div className="item-meta" key={`${code}-${item.label}`}>
          <small>{item.label}</small>
          <strong>{item.value}</strong>
          <span>{item.caption}</span>
        </div>
      ))}
      <div className="row-actions">
        {actionHref ? (
          <a className="row-button" href={actionHref}>
            {action}
          </a>
        ) : (
          <button type="button">{action}</button>
        )}
        <span className={`status-pill status-${status.replaceAll("_", "-")}`}>{status.replaceAll("_", " ")}</span>
      </div>
    </article>
  );
}
