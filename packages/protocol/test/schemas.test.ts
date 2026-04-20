import { describe, expect, it } from "vitest";
import {
  CodebaseSchema,
  LeaseOutcomeUploadSchema,
  SessionEventEnvelopeSchema,
  WorkItemSchema
} from "../src/index";

const now = "2026-04-20T08:00:00.000Z";

describe("automomo protocol schemas", () => {
  it("parses a source-neutral codebase with defaults", () => {
    const codebase = CodebaseSchema.parse({
      id: "codebase_1",
      name: "automomo",
      provider: "git",
      createdAt: now,
      updatedAt: now
    });

    expect(codebase.status).toBe("active");
    expect(codebase.metadata).toEqual({});
  });

  it("rejects empty identifiers before they reach API state", () => {
    expect(() =>
      WorkItemSchema.parse({
        id: "",
        codebaseId: "codebase_1",
        title: "Investigate runtime lease",
        createdAt: now,
        updatedAt: now
      })
    ).toThrow();
  });

  it("keeps session event envelopes stable for realtime consumers", () => {
    const envelope = SessionEventEnvelopeSchema.parse({
      type: "session.event",
      version: 1,
      payload: {
        id: "event_1",
        sessionId: "session_1",
        sequence: 0,
        kind: "runtime",
        summary: "Runtime accepted lease",
        createdAt: now
      }
    });

    expect(envelope.payload.metadata).toEqual({});
    expect(envelope.payload.kind).toBe("runtime");
  });

  it("validates daemon outcome uploads against a lease and session", () => {
    const upload = LeaseOutcomeUploadSchema.parse({
      runtimeId: "runtime_1",
      leaseId: "lease_1",
      sessionId: "session_1",
      outcome: {
        id: "outcome_1",
        sessionId: "session_1",
        status: "success",
        summary: "Produced a reviewable patch",
        result: { patchReady: true },
        createdAt: now
      }
    });

    expect(upload.outcome.eventsUploaded).toBe(0);
    expect(upload.outcome.result).toEqual({ patchReady: true });
  });
});
