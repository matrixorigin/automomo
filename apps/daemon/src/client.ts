import {
  AgentRunEventUpload,
  AgentRunFailureUpload,
  AgentRunLease,
  AgentRunLeaseResponseSchema,
  AgentRunOutcomeUpload,
  DaemonRegistration,
  DaemonRegistrationResponseSchema,
  Runtime,
  RuntimeHeartbeat,
  RuntimeSchema
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

  async pollLease(runtimeId: string): Promise<AgentRunLease | null> {
    const payload = await this.post("/api/daemon/lease", { runtimeId });
    return AgentRunLeaseResponseSchema.parse(payload).lease;
  }

  async heartbeat(input: RuntimeHeartbeat) {
    return this.post("/api/daemon/heartbeat", input);
  }

  async renewLease(input: { runtimeId: string; leaseId: string }) {
    return this.post("/api/daemon/lease/renew", input);
  }

  async uploadEvents(input: AgentRunEventUpload) {
    return this.post("/api/daemon/events", input);
  }

  async uploadOutcome(input: AgentRunOutcomeUpload) {
    return this.post("/api/daemon/outcome", input);
  }

  async failLease(input: AgentRunFailureUpload) {
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
    const signingSecret = `sha256:${createHash("sha256").update(this.identity.secret).digest("hex")}`;
    const signature = createHmac("sha256", signingSecret).update(canonical).digest("hex");
    return {
      "x-automomo-daemon-id": this.identity.daemonId,
      "x-automomo-runtime-id": this.identity.runtimeId,
      "x-automomo-timestamp": timestamp,
      "x-automomo-nonce": nonce,
      "x-automomo-signature-version": "hmac-sha256-v1",
      "x-automomo-signature": signature
    };
  }
}
