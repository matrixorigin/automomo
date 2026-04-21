import React from "react";

export type AvatarProps = React.HTMLAttributes<HTMLSpanElement> & {
  name: string;
  color?: string;
  initials?: string;
};

function getInitials(name: string) {
  const chunks = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (chunks.length === 0) {
    return "?";
  }
  return chunks.map((chunk) => chunk[0]?.toUpperCase() ?? "").join("");
}

export function Avatar({ name, color, initials, className, style, ...props }: AvatarProps) {
  const classes = ["ui-avatar", className].filter(Boolean).join(" ");
  const mergedStyle = { ...style, ...(color ? { backgroundColor: color } : {}) };
  return (
    <span className={classes} style={mergedStyle} aria-label={name} {...props}>
      {initials ?? getInitials(name)}
    </span>
  );
}
