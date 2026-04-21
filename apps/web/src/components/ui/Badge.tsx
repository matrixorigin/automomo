import React from "react";

export type BadgeTone = "neutral" | "green" | "yellow" | "red" | "blue";

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  const classes = ["ui-badge", `tone-${tone}`, className].filter(Boolean).join(" ");
  return <span className={classes} {...props} />;
}
