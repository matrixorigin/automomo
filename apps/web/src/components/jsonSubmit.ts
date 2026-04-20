"use client";

import React from "react";

export function submitJsonForm(endpoint: string, buildPayload: (formData: FormData) => Record<string, unknown>) {
  return async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildPayload(new FormData(event.currentTarget)))
    });
    if (!response.ok) {
      throw new Error(`automomo mutation ${endpoint} failed with ${response.status}`);
    }
    window.location.reload();
  };
}

export function optionalString(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : undefined;
}

export function commaList(value: FormDataEntryValue | null) {
  return (optionalString(value) ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function commandList(value: FormDataEntryValue | null) {
  return (optionalString(value) ?? "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function numberValue(value: FormDataEntryValue | null, fallback: number) {
  const text = optionalString(value);
  if (!text) {
    return fallback;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}
