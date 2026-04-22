import { createPiRuntimeAdapter, PiRuntimeAdapter, PiRuntimeContext } from "@automomo/pi-runtime";
import { AgentRunLease, DaemonRegistration, Runtime, SessionEvent } from "@automomo/protocol";
import { DaemonApiClient } from "./client";

export interface DaemonWorkerOptions {
  client: DaemonApiClient;
  registration: DaemonRegistration;
  runtimeAdapter?: PiRuntimeAdapter;
  leaseRenewalIntervalMs?: number;
  now?: () => Date;
  onKeepaliveError?: (error: unknown) => void;
}

export type DaemonPollResult =
  | { status: "idle" }
  | { status: "completed"; leaseId: string; runId: string; outcomeId: string }
  | { status: "failed"; leaseId: string; runId: string; reason: string };

const DEFAULT_LEASE_RENEWAL_INTERVAL_MS = 30_000;

export class DaemonWorker {
  private runtime: Runtime | undefined;
  private readonly runtimeAdapter: PiRuntimeAdapter;
  private readonly leaseRenewalIntervalMs: number;
  private readonly now: () => Date;

  constructor(private readonly options: DaemonWorkerOptions) {
    this.runtimeAdapter = options.runtimeAdapter ?? createPiRuntimeAdapter();
    this.leaseRenewalIntervalMs = options.leaseRenewalIntervalMs ?? DEFAULT_LEASE_RENEWAL_INTERVAL_MS;
    this.now = options.now ?? (() => new Date());
  }

  async register() {
    this.runtime = await this.options.client.register(this.options.registration);
    return this.runtime;
  }

  async pollOnce(): Promise<DaemonPollResult> {
    const runtime = this.runtime ?? (await this.register());
    await this.markRuntimeIdle(runtime);
    const lease = await this.options.client.pollLease(runtime.id);
    if (!lease) {
      return { status: "idle" as const };
    }

    await this.keepLeaseAlive(runtime, lease);
    const stopKeepalive = this.startLeaseKeepalive(runtime, lease);

    try {
      let result;
      try {
        result = await this.runtimeAdapter.runSession(agentRunLeaseToPiContext(lease));
      } catch (err) {
        const reason = err instanceof Error ? err.message : "runtime adapter failed";
        await this.options.client.failLease({
          runtimeId: runtime.id,
          leaseId: lease.leaseId,
          runId: lease.run.id,
          reason,
          detail: reason,
          metadata: {}
        });
        return {
          status: "failed" as const,
          leaseId: lease.leaseId,
          runId: lease.run.id,
          reason
        };
      }

      if (result.events.length > 0) {
        await this.options.client.uploadEvents({
          runtimeId: runtime.id,
          leaseId: lease.leaseId,
          runId: lease.run.id,
          events: result.events.map(toAgentRunEvent)
        });
      }
      await this.options.client.uploadOutcome({
        runtimeId: runtime.id,
        leaseId: lease.leaseId,
        runId: lease.run.id,
        content: result.outcome.summary,
        outcome: {
          status: result.outcome.status,
          summary: result.outcome.summary,
          result: result.outcome.result
        },
        artifacts: result.artifacts ?? [],
        sessionUrl: null
      });

      return {
        status: "completed" as const,
        leaseId: lease.leaseId,
        runId: lease.run.id,
        outcomeId: result.outcome.id
      };
    } finally {
      await stopKeepalive();
      await this.markRuntimeIdle(runtime).catch(() => undefined);
    }
  }

  private async keepLeaseAlive(runtime: Runtime, lease: AgentRunLease) {
    await this.options.client.renewLease({ runtimeId: runtime.id, leaseId: lease.leaseId });
    await this.options.client.heartbeat({
      runtimeId: runtime.id,
      status: "busy",
      activeSessions: 1,
      capacity: runtime.capacity,
      observedAt: this.now().toISOString()
    });
  }

  private startLeaseKeepalive(runtime: Runtime, lease: AgentRunLease) {
    if (this.leaseRenewalIntervalMs <= 0) {
      return async () => undefined;
    }

    const pending = new Set<Promise<void>>();
    const keepAlive = () => {
      const request = this.keepLeaseAlive(runtime, lease)
        .catch((error) => {
          this.options.onKeepaliveError?.(error);
        })
        .finally(() => {
          pending.delete(request);
        });
      pending.add(request);
    };
    const timer = setInterval(() => {
      keepAlive();
    }, this.leaseRenewalIntervalMs);

    return async () => {
      clearInterval(timer);
      await Promise.allSettled([...pending]);
    };
  }

  private async markRuntimeIdle(runtime: Runtime) {
    await this.options.client.heartbeat({
      runtimeId: runtime.id,
      status: "online",
      activeSessions: 0,
      capacity: runtime.capacity,
      observedAt: this.now().toISOString()
    });
  }
}

export function agentRunLeaseToPiContext(lease: AgentRunLease, now: Date = new Date()): PiRuntimeContext {
  const timestamp = now.toISOString();
  const workspaceRoot =
    typeof lease.runtime.environment.workspaceRoot === "string"
      ? lease.runtime.environment.workspaceRoot
      : lease.runtime.workspaceRoot ?? undefined;

  return {
    session: {
      id: lease.run.id,
      codebaseId: lease.runtime.id,
      roomId: lease.run.roomId,
      agentId: lease.run.agentId,
      runtimeId: lease.runtime.id,
      status: "running",
      participants: [{ type: "agent", id: lease.agent.id, name: lease.agent.name }],
      metadata: {
        room: lease.room,
        context: lease.context,
        sourceMessageId: lease.run.sourceMessageId,
        depth: lease.run.depth
      },
      createdAt: timestamp,
      updatedAt: timestamp
    },
    runtime: {
      id: lease.runtime.id,
      name: lease.runtime.name,
      mode: "remote_daemon",
      provider: lease.runtime.provider,
      environment: {
        ...lease.runtime.environment,
        workspaceRoot,
        networkPolicy: "restricted",
        env: {},
        secretRefs: []
      },
      status: "online",
      capacity: 1,
      activeSessions: 1,
      metadata: {},
      createdAt: timestamp,
      updatedAt: timestamp
    },
    agent: {
      id: lease.agent.id,
      name: lease.agent.name,
      model: lease.runtime.provider,
      role: lease.agent.role,
      description: lease.agent.description,
      instructions: [
        lease.agent.role ? `Role: ${lease.agent.role}` : "",
        lease.agent.description ? `Description: ${lease.agent.description}` : "",
        lease.agent.systemPrompt
      ].filter(Boolean).join("\n\n"),
      skills: lease.agent.skills,
      tools: [],
      defaultRuntimeId: lease.runtime.id,
      defaultEnvironmentId: lease.runtime.id,
      maxConcurrency: 1,
      metadata: { mcpServers: lease.agent.mcpServers },
      createdAt: timestamp,
      updatedAt: timestamp
    },
    workItem: {
      id: lease.run.id,
      codebaseId: lease.runtime.id,
      roomId: lease.run.roomId,
      title: `Room request for ${lease.agent.name}`,
      body: lease.run.prompt,
      source: "manual",
      status: "running",
      priority: "medium",
      labels: ["room-run"],
      metadata: {},
      createdAt: timestamp,
      updatedAt: timestamp
    }
  };
}

function toAgentRunEvent(event: SessionEvent) {
  return {
    kind: event.kind,
    summary: event.summary,
    detail: event.detail ?? "",
    metadata: {
      ...event.metadata,
      sessionEventId: event.id,
      sequence: event.sequence,
      createdAt: event.createdAt
    }
  };
}
