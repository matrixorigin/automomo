import React from "react";

export type PanelProps = React.HTMLAttributes<HTMLElement> & {
  title: string;
  actions?: React.ReactNode;
};

export function Panel({ title, actions, className, children, ...props }: PanelProps) {
  const classes = ["ui-panel", className].filter(Boolean).join(" ");
  return (
    <section className={classes} {...props}>
      <header className="ui-panel-header">
        <h2>{title}</h2>
        {actions}
      </header>
      <div className="ui-panel-body">{children}</div>
    </section>
  );
}
