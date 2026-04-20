import { describe, expect, it } from "vitest";
import { createPiRuntimeAdapter } from "@automomo/pi-runtime";
import { DaemonWorker } from "../src/worker";

const now = "2026-04-20T08:00:00.000Z";
const environment = { networkPolicy: "restricted" as const, env: {}, secretRefs: [] };

describe("DaemonWorker", () => {
  it("registers a runtime, claims one lease, uploads events, and uploads only a structured outcome", async () => {
    const calls: { path: string; body: any }[] = [];
    const client = {
      register: async () => ({
        id: "runtime_1",
        name: "Remote Pi runtime",
        mode: "remote_daemon" as const,
        provider: "pi" as const,
        environment: { networkPolicy: "restricted" as const, env: {}, secretRefs: [] },
        status: "online" as const,
        capacity: 1,
        activeSessions: 0,
        metadata: {},
        createdAt: now,
        updatedAt: now
      }),
      pollLease: async () => ({
        leaseId: "lease_1",
        expiresAt: "2026-04-20T08:05:00.000Z",
        runtime: {
          id: "runtime_1",
          name: "Remote Pi runtime",
          mode: "remote_daemon" as const,
          provider: "pi" as const,
          environment: { networkPolicy: "restricted" as const, env: {}, secretRefs: [] },
          status: "online" as const,
          capacity: 1,
          activeSessions: 0,
          metadata: {},
          createdAt: now,
          updatedAt: now
        },
        session: {
          id: "session_1",
          codebaseId: "codebase_1",
          status: "leased" as const,
          participants: [],
          metadata: {},
          createdAt: now,
          updatedAt: now
        }
      }),
      heartbeat: async (body: any) => {
        calls.push({ path: "heartbeat", body });
      },
      renewLease: async (body: any) => {
        calls.push({ path: "renew", body });
      },
      uploadEvents: async (body: any) => {
        calls.push({ path: "events", body });
      },
      uploadOutcome: async (body: any) => {
        calls.push({ path: "outcome", body });
      },
      failLease: async (body: any) => {
        calls.push({ path: "fail", body });
      }
    };

    const worker = new DaemonWorker({
      client: client as any,
      registration: { name: "Remote Pi runtime", provider: "pi", environment },
      runtimeAdapter: createPiRuntimeAdapter({ now: () => new Date(now) })
    });

    const result = await worker.pollOnce();

    expect(result).toMatchObject({ status: "completed", leaseId: "lease_1", sessionId: "session_1" });
    expect(calls.map((call) => call.path)).toEqual(["heartbeat", "renew", "events", "outcome"]);
    expect(calls[3]?.body.outcome.result).toMatchObject({ runtimeId: "runtime_1" });
  });

  it("stays idle when no lease is available", async () => {
    const worker = new DaemonWorker({
      client: {
        register: async () => ({
          id: "runtime_1",
          name: "Remote Pi runtime",
          mode: "remote_daemon",
          provider: "pi",
          environment: { networkPolicy: "restricted", env: {}, secretRefs: [] },
          status: "online",
          capacity: 1,
          activeSessions: 0,
          metadata: {},
          createdAt: now,
          updatedAt: now
        }),
        pollLease: async () => null,
        heartbeat: async () => undefined,
        renewLease: async () => undefined,
        uploadEvents: async () => undefined,
        uploadOutcome: async () => undefined,
        failLease: async () => undefined
      } as any,
      registration: { name: "Remote Pi runtime", provider: "pi", environment }
    });

    await expect(worker.pollOnce()).resolves.toEqual({ status: "idle" });
  });

  it("uploads a lease failure when adapter execution throws", async () => {
    const calls: { path: string; body: any }[] = [];
    const worker = new DaemonWorker({
      client: {
        register: async () => ({
          id: "runtime_1",
          name: "Remote Pi runtime",
          mode: "remote_daemon",
          provider: "pi",
          environment,
          status: "online",
          capacity: 1,
          activeSessions: 0,
          metadata: {},
          createdAt: now,
          updatedAt: now
        }),
        pollLease: async () => ({
          leaseId: "lease_1",
          expiresAt: "2026-04-20T08:05:00.000Z",
          runtime: {
            id: "runtime_1",
            name: "Remote Pi runtime",
            mode: "remote_daemon" as const,
            provider: "pi" as const,
            environment,
            status: "online" as const,
            capacity: 1,
            activeSessions: 0,
            metadata: {},
            createdAt: now,
            updatedAt: now
          },
          session: {
            id: "session_1",
            codebaseId: "codebase_1",
            status: "leased" as const,
            participants: [],
            metadata: {},
            createdAt: now,
            updatedAt: now
          }
        }),
        heartbeat: async () => undefined,
        renewLease: async () => undefined,
        uploadEvents: async () => undefined,
        uploadOutcome: async () => undefined,
        failLease: async (body: any) => {
          calls.push({ path: "fail", body });
        }
      } as any,
      registration: { name: "Remote Pi runtime", provider: "pi", environment },
      runtimeAdapter: {
        runSession: async () => {
          throw new Error("adapter exploded");
        }
      } as any
    });

    const result = await worker.pollOnce();

    expect(result).toMatchObject({ status: "failed", leaseId: "lease_1", sessionId: "session_1" });
    expect(calls).toEqual([
      expect.objectContaining({
        path: "fail",
        body: expect.objectContaining({ leaseId: "lease_1", sessionId: "session_1", reason: "adapter exploded" })
      })
    ]);
  });
});
