import React from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  const classes = ["ui-button", `is-${variant}`, className].filter(Boolean).join(" ");
  return <button className={classes} type={type} {...props} />;
}
