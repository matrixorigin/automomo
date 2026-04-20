import { createPiRuntimeAdapter, PiRuntimeAdapter } from "@automomo/pi-runtime";
import { DaemonRegistration, Runtime } from "@automomo/protocol";
import { DaemonApiClient } from "./client";

export interface DaemonWorkerOptions {
  client: DaemonApiClient;
  registration: DaemonRegistration;
  runtimeAdapter?: PiRuntimeAdapter;
}

export class DaemonWorker {
  private runtime: Runtime | undefined;
  private readonly runtimeAdapter: PiRuntimeAdapter;

  constructor(private readonly options: DaemonWorkerOptions) {
    this.runtimeAdapter = options.runtimeAdapter ?? createPiRuntimeAdapter();
  }

  async register() {
    this.runtime = await this.options.client.register(this.options.registration);
    return this.runtime;
  }

  async pollOnce() {
    const runtime = this.runtime ?? (await this.register());
    await this.options.client.heartbeat({
      runtimeId: runtime.id,
      status: "online",
      activeSessions: 0,
      capacity: runtime.capacity,
      observedAt: new Date().toISOString()
    });
    const lease = await this.options.client.pollLease(runtime.id);
    if (!lease) {
      return { status: "idle" as const };
    }
    await this.options.client.renewLease({ runtimeId: runtime.id, leaseId: lease.leaseId });

    let result;
    try {
      result = await this.runtimeAdapter.runSession({
        session: lease.session,
        workItem: lease.workItem,
        agent: lease.agent,
        runtime: lease.runtime
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "runtime adapter failed";
      await this.options.client.failLease({
        runtimeId: runtime.id,
        leaseId: lease.leaseId,
        sessionId: lease.session.id,
        reason,
        detail: reason
      });
      return {
        status: "failed" as const,
        leaseId: lease.leaseId,
        sessionId: lease.session.id,
        reason
      };
    }

    await this.options.client.uploadEvents({
      runtimeId: runtime.id,
      leaseId: lease.leaseId,
      sessionId: lease.session.id,
      events: result.events
    });
    await this.options.client.uploadOutcome({
      runtimeId: runtime.id,
      leaseId: lease.leaseId,
      sessionId: lease.session.id,
      outcome: result.outcome
    });

    return {
      status: "completed" as const,
      leaseId: lease.leaseId,
      sessionId: lease.session.id,
      outcomeId: result.outcome.id
    };
  }
}
