import React from "react";
import { ButtonVariant } from "./Button";

export type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  "aria-label": string;
  variant?: ButtonVariant;
};

export function IconButton({ variant = "ghost", className, type = "button", ...props }: IconButtonProps) {
  const classes = ["ui-icon-button", `is-${variant}`, className].filter(Boolean).join(" ");
  return <button className={classes} type={type} {...props} />;
}
