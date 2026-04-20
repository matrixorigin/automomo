import {
  DaemonRegistration,
  DaemonRegistrationResponseSchema,
  Lease,
  LeaseResponseSchema,
  Outcome,
  Runtime,
  RuntimeHeartbeat,
  RuntimeSchema,
  SessionEvent
} from "@automomo/protocol";
import { createHash, createHmac, randomUUID } from "node:crypto";

export interface DaemonApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class DaemonApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private identity:
    | {
        daemonId: string;
        runtimeId: string;
        secret: string;
      }
    | undefined;

  constructor(options: DaemonApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async register(registration: DaemonRegistration): Promise<Runtime> {
    const payload = await this.post("/api/daemon/register", registration);
    const parsed = DaemonRegistrationResponseSchema.parse(payload);
    this.identity = {
      daemonId: parsed.daemon.id,
      runtimeId: parsed.runtime.id,
      secret: parsed.secret
    };
    return RuntimeSchema.parse(parsed.runtime);
  }

  async pollLease(runtimeId: string): Promise<Lease | null> {
    const payload = await this.post("/api/daemon/lease", { runtimeId });
    return LeaseResponseSchema.parse(payload).lease;
  }

  async heartbeat(input: RuntimeHeartbeat) {
    return this.post("/api/daemon/heartbeat", input);
  }

  async renewLease(input: { runtimeId: string; leaseId: string }) {
    return this.post("/api/daemon/lease/renew", input);
  }

  async uploadEvents(input: { runtimeId: string; leaseId: string; sessionId: string; events: SessionEvent[] }) {
    return this.post("/api/daemon/events", input);
  }

  async uploadOutcome(input: { runtimeId: string; leaseId: string; sessionId: string; outcome: Outcome }) {
    return this.post("/api/daemon/outcome", input);
  }

  async failLease(input: { runtimeId: string; leaseId: string; sessionId: string; reason: string; detail?: string; metadata?: Record<string, unknown> }) {
    return this.post("/api/daemon/fail", input);
  }

  private async post(path: string, body: unknown): Promise<any> {
    const bodyText = JSON.stringify(body);
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.signedHeaders(path, bodyText) },
      body: bodyText
    });
    if (!response.ok) {
      throw new Error(`automomo daemon API ${path} failed with ${response.status}`);
    }
    return response.json();
  }

  private signedHeaders(path: string, bodyText: string): Record<string, string> {
    if (!this.identity) {
      return {};
    }
    const timestamp = this.now().toISOString();
    const nonce = randomUUID();
    const bodyHash = createHash("sha256").update(bodyText).digest("hex");
    const canonical = [
      "POST",
      path,
      timestamp,
      bodyHash,
      this.identity.daemonId,
      this.identity.runtimeId,
      nonce
    ].join("\n");
    const signature = createHmac("sha256", this.identity.secret).update(canonical).digest("hex");
    return {
      "x-automomo-daemon-id": this.identity.daemonId,
      "x-automomo-runtime-id": this.identity.runtimeId,
      "x-automomo-timestamp": timestamp,
      "x-automomo-nonce": nonce,
      "x-automomo-signature": signature
    };
  }
}
