import { describe, expect, it } from "vitest"
import {
  buildDaemonSignature,
  hashDaemonSecret,
  requireSignedDaemonRequest,
  verifyDaemonSecret,
} from "../lib/daemon-auth"
import { prisma } from "../lib/prisma"
import { withTestDatabase } from "./helpers/test-db"

function jsonRequest(path: string, bodyText: string, headers: Record<string, string> = {}) {
  return new Request(`http://automomo.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: bodyText,
  })
}

describe("daemon auth", () => {
  it("hashes and verifies daemon secrets", () => {
    const hash = hashDaemonSecret("secret-value")
    expect(hash).not.toBe("secret-value")
    expect(verifyDaemonSecret("secret-value", hash)).toBe(true)
    expect(verifyDaemonSecret("wrong", hash)).toBe(false)
  })

  it("builds deterministic HMAC signatures for the same canonical request", () => {
    const input = {
      method: "POST",
      path: "/api/daemon/heartbeat",
      timestamp: "2026-04-22T00:00:00.000Z",
      bodyText: "{\"runtimeId\":\"runtime_1\"}",
      daemonId: "daemon_1",
      runtimeId: "runtime_1",
      nonce: "nonce_1",
      secret: "secret_1",
    }
    expect(buildDaemonSignature(input)).toBe(buildDaemonSignature(input))
  })

  it("accepts valid signed daemon requests and rejects invalid signatures", withTestDatabase(async () => {
    await prisma.runtime.create({ data: { id: "runtime_1", name: "Runtime", workspaceRoot: "/repo" } })
    await prisma.daemon.create({
      data: {
        id: "daemon_1",
        runtimeId: "runtime_1",
        name: "Daemon",
        secretHash: hashDaemonSecret("secret_1"),
        secretPreview: "secret...",
      },
    })

    const bodyText = "{\"runtimeId\":\"runtime_1\"}"
    const timestamp = "2026-04-22T00:00:00.000Z"
    const validSignature = buildDaemonSignature({
      method: "POST",
      path: "/api/daemon/heartbeat",
      timestamp,
      bodyText,
      daemonId: "daemon_1",
      runtimeId: "runtime_1",
      nonce: "nonce_valid",
      secret: "secret_1",
    })

    await expect(
      requireSignedDaemonRequest(
        jsonRequest("/api/daemon/heartbeat", bodyText, {
          "x-automomo-daemon-id": "daemon_1",
          "x-automomo-runtime-id": "runtime_1",
          "x-automomo-timestamp": timestamp,
          "x-automomo-nonce": "nonce_valid",
          "x-automomo-signature": validSignature,
        }),
        bodyText
      )
    ).resolves.toEqual({ daemonId: "daemon_1", runtimeId: "runtime_1" })

    await expect(
      requireSignedDaemonRequest(
        jsonRequest("/api/daemon/heartbeat", bodyText, {
          "x-automomo-daemon-id": "daemon_1",
          "x-automomo-runtime-id": "runtime_1",
          "x-automomo-timestamp": timestamp,
          "x-automomo-nonce": "nonce_invalid",
          "x-automomo-signature": "bad",
        }),
        bodyText
      )
    ).rejects.toThrow("invalid daemon signature")
  }))
})
