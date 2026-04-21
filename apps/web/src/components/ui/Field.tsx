import React from "react";

export type FieldProps = React.HTMLAttributes<HTMLDivElement> & {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
};

export function Field({ label, htmlFor, hint, error, required, className, children, ...props }: FieldProps) {
  const classes = ["ui-field", error ? "has-error" : null, className].filter(Boolean).join(" ");
  return (
    <div className={classes} {...props}>
      <label className="ui-field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true">*</span> : null}
      </label>
      {children}
      {hint ? <p className="ui-field-hint">{hint}</p> : null}
      {error ? <p className="ui-field-error">{error}</p> : null}
    </div>
  );
}
