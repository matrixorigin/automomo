import { createPiRuntimeAdapter, PiRuntimeAdapter, PiRuntimeContext } from "@automomo/pi-runtime";
import { AgentRunLease, DaemonRegistration, Runtime, SessionEvent } from "@automomo/protocol";
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
      sessionUrl: null
    });

    return {
      status: "completed" as const,
      leaseId: lease.leaseId,
      runId: lease.run.id,
      outcomeId: result.outcome.id
    };
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
