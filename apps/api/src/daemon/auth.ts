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
}) {
  return [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    createHash("sha256").update(input.bodyText).digest("hex"),
    input.daemonId,
    input.runtimeId
  ].join("\n");
}

export function signDaemonRequest(input: {
  method: string;
  path: string;
  timestamp: string;
  bodyText: string;
  daemonId: string;
  runtimeId: string;
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
  if (Math.abs(Date.parse(input.now) - Date.parse(parsed.data.timestamp)) > 24 * 60 * 60 * 1000) {
    return { ok: false as const, status: 401, error: "stale daemon signature" };
  }

  const expected = signDaemonRequest({
    method: input.method,
    path: input.path,
    timestamp: parsed.data.timestamp,
    bodyText: input.bodyText,
    daemonId: parsed.data.daemonId,
    runtimeId: parsed.data.runtimeId,
    secret: daemon.secret
  });
  if (!safeEqual(expected, parsed.data.signature)) {
    return { ok: false as const, status: 401, error: "invalid daemon signature" };
  }
  return { ok: true as const, daemon };
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
