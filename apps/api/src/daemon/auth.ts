import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { DaemonSignedRequestHeadersSchema } from "@automomo/protocol";
import { ControlPlaneStore } from "../store";

export function canonicalDaemonString(input: {
  method: string;
  path: string;
  timestamp: string;
  bodyText: string;
  daemonId: string;
  runtimeId: string;
  nonce: string;
}) {
  return [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    createHash("sha256").update(input.bodyText).digest("hex"),
    input.daemonId,
    input.runtimeId,
    input.nonce
  ].join("\n");
}

export function signDaemonRequest(input: {
  method: string;
  path: string;
  timestamp: string;
  bodyText: string;
  daemonId: string;
  runtimeId: string;
  nonce: string;
  secret: string;
}) {
  return createHmac("sha256", input.secret).update(canonicalDaemonString(input)).digest("hex");
}

export function verifyDaemonRequest(input: {
  store: ControlPlaneStore;
  method: string;
  path: string;
  headers: Headers;
  bodyText: string;
  now: string;
}) {
  const parsed = DaemonSignedRequestHeadersSchema.safeParse({
    daemonId: input.headers.get("x-automomo-daemon-id"),
    runtimeId: input.headers.get("x-automomo-runtime-id"),
    timestamp: input.headers.get("x-automomo-timestamp"),
    nonce: input.headers.get("x-automomo-nonce"),
    signature: input.headers.get("x-automomo-signature"),
    signatureVersion: input.headers.get("x-automomo-signature-version") ?? "hmac-sha256-v1"
  });
  if (!parsed.success) {
    return { ok: false as const, status: 401, error: "missing daemon signature" };
  }

  const daemon = input.store.getDaemon(parsed.data.daemonId);
  if (!daemon) {
    return { ok: false as const, status: 401, error: "unknown daemon" };
  }
  if (daemon.runtimeId !== parsed.data.runtimeId) {
    return { ok: false as const, status: 403, error: "daemon runtime mismatch" };
  }
  if (Math.abs(Date.parse(input.now) - Date.parse(parsed.data.timestamp)) > 5 * 60 * 1000) {
    return { ok: false as const, status: 401, error: "stale daemon signature" };
  }
  const bodyRuntimeId = runtimeIdFromBody(input.bodyText);
  if (bodyRuntimeId && bodyRuntimeId !== parsed.data.runtimeId) {
    return { ok: false as const, status: 403, error: "daemon body runtime mismatch" };
  }

  const expected = signDaemonRequest({
    method: input.method,
    path: input.path,
    timestamp: parsed.data.timestamp,
    bodyText: input.bodyText,
    daemonId: parsed.data.daemonId,
    runtimeId: parsed.data.runtimeId,
    nonce: parsed.data.nonce,
    secret: daemon.secret
  });
  if (!safeEqual(expected, parsed.data.signature)) {
    return { ok: false as const, status: 401, error: "invalid daemon signature" };
  }
  const nonceExpiresAt = new Date(Date.parse(input.now) + 5 * 60 * 1000).toISOString();
  if (!input.store.recordDaemonNonce({ daemonId: parsed.data.daemonId, nonce: parsed.data.nonce, expiresAt: nonceExpiresAt })) {
    return { ok: false as const, status: 401, error: "replayed daemon signature" };
  }
  return { ok: true as const, daemon };
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function runtimeIdFromBody(bodyText: string) {
  try {
    const body = JSON.parse(bodyText) as { runtimeId?: unknown };
    return typeof body.runtimeId === "string" ? body.runtimeId : undefined;
  } catch {
    return undefined;
  }
}
