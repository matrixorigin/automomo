import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { DaemonSignedRequestHeadersSchema } from "@automomo/protocol"
import { prisma } from "@/lib/prisma"

const SIGNING_KEY_PREFIX = "sha256:"
const NONCE_TTL_MS = 5 * 60 * 1000

const globalForDaemonAuth = globalThis as unknown as {
  automomoDaemonNonces?: Map<string, number>
}

const daemonNonces = globalForDaemonAuth.automomoDaemonNonces ?? new Map<string, number>()
globalForDaemonAuth.automomoDaemonNonces = daemonNonces

export class DaemonAuthError extends Error {
  constructor(
    message: string,
    public readonly status = 401
  ) {
    super(message)
    this.name = "DaemonAuthError"
  }
}

export function hashDaemonSecret(secret: string): string {
  return `${SIGNING_KEY_PREFIX}${createHash("sha256").update(secret).digest("hex")}`
}

export function verifyDaemonSecret(secret: string, hash: string): boolean {
  return safeEqual(hashDaemonSecret(secret), hash)
}

function canonicalDaemonString(input: {
  method: string
  path: string
  timestamp: string
  bodyText: string
  daemonId: string
  runtimeId: string
  nonce: string
}) {
  return [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    createHash("sha256").update(input.bodyText).digest("hex"),
    input.daemonId,
    input.runtimeId,
    input.nonce,
  ].join("\n")
}

export function buildDaemonSignature(input: {
  method: string
  path: string
  timestamp: string
  bodyText: string
  daemonId: string
  runtimeId: string
  nonce: string
  secret: string
}): string {
  return createHmac("sha256", hashDaemonSecret(input.secret))
    .update(canonicalDaemonString(input))
    .digest("hex")
}

function buildStoredHashSignature(input: {
  method: string
  path: string
  timestamp: string
  bodyText: string
  daemonId: string
  runtimeId: string
  nonce: string
  secretHash: string
}) {
  return createHmac("sha256", input.secretHash)
    .update(canonicalDaemonString(input))
    .digest("hex")
}

export async function requireSignedDaemonRequest(
  request: Request,
  bodyText: string
): Promise<{ daemonId: string; runtimeId: string }> {
  pruneExpiredNonces()

  const parsed = DaemonSignedRequestHeadersSchema.safeParse({
    daemonId: request.headers.get("x-automomo-daemon-id"),
    runtimeId: request.headers.get("x-automomo-runtime-id"),
    timestamp: request.headers.get("x-automomo-timestamp"),
    nonce: request.headers.get("x-automomo-nonce"),
    signature: request.headers.get("x-automomo-signature"),
    signatureVersion: request.headers.get("x-automomo-signature-version") ?? "hmac-sha256-v1",
  })
  if (!parsed.success) {
    throw new DaemonAuthError("missing daemon signature", 401)
  }

  const daemon = await prisma.daemon.findUnique({
    where: { id: parsed.data.daemonId },
    select: { id: true, runtimeId: true, secretHash: true },
  })
  if (!daemon) {
    throw new DaemonAuthError("unknown daemon", 401)
  }
  if (daemon.runtimeId !== parsed.data.runtimeId) {
    throw new DaemonAuthError("daemon runtime mismatch", 403)
  }

  const bodyRuntimeId = runtimeIdFromBody(bodyText)
  if (bodyRuntimeId && bodyRuntimeId !== parsed.data.runtimeId) {
    throw new DaemonAuthError("daemon body runtime mismatch", 403)
  }

  const path = new URL(request.url).pathname
  const expected = buildStoredHashSignature({
    method: request.method,
    path,
    timestamp: parsed.data.timestamp,
    bodyText,
    daemonId: parsed.data.daemonId,
    runtimeId: parsed.data.runtimeId,
    nonce: parsed.data.nonce,
    secretHash: daemon.secretHash,
  })
  if (!safeEqual(expected, parsed.data.signature)) {
    throw new DaemonAuthError("invalid daemon signature", 401)
  }

  const nonceKey = `${parsed.data.daemonId}:${parsed.data.nonce}`
  if (daemonNonces.has(nonceKey)) {
    throw new DaemonAuthError("replayed daemon signature", 401)
  }
  daemonNonces.set(nonceKey, Date.now() + NONCE_TTL_MS)

  return { daemonId: daemon.id, runtimeId: daemon.runtimeId }
}

function runtimeIdFromBody(bodyText: string) {
  try {
    const body = JSON.parse(bodyText) as { runtimeId?: unknown }
    return typeof body.runtimeId === "string" ? body.runtimeId : undefined
  } catch {
    return undefined
  }
}

function pruneExpiredNonces() {
  const now = Date.now()
  for (const [key, expiresAt] of daemonNonces) {
    if (expiresAt <= now) daemonNonces.delete(key)
  }
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
