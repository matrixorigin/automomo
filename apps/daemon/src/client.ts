import {
  DaemonRegistration,
  Lease,
  LeaseResponseSchema,
  Outcome,
  Runtime,
  RuntimeSchema,
  SessionEvent
} from "@automomo/protocol";

export interface DaemonApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class DaemonApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DaemonApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async register(registration: DaemonRegistration): Promise<Runtime> {
    const payload = await this.post("/api/daemon/register", registration);
    return RuntimeSchema.parse(payload.runtime);
  }

  async pollLease(runtimeId: string): Promise<Lease | null> {
    const payload = await this.post("/api/daemon/lease", { runtimeId });
    return LeaseResponseSchema.parse(payload).lease;
  }

  async uploadEvents(input: { runtimeId: string; leaseId: string; sessionId: string; events: SessionEvent[] }) {
    return this.post("/api/daemon/events", input);
  }

  async uploadOutcome(input: { runtimeId: string; leaseId: string; sessionId: string; outcome: Outcome }) {
    return this.post("/api/daemon/outcome", input);
  }

  private async post(path: string, body: unknown): Promise<any> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`automomo daemon API ${path} failed with ${response.status}`);
    }
    return response.json();
  }
}
