import {
  Agent,
  Outcome,
  Runtime,
  Session,
  SessionEvent,
  WorkItem
} from "@automomo/protocol";

export interface PiRuntimeContext {
  session: Session;
  runtime: Runtime;
  workItem?: WorkItem;
  agent?: Agent;
}

export interface PiRuntimeResult {
  events: SessionEvent[];
  outcome: Outcome;
}

export interface PiRuntimeRunner {
  run(context: PiRuntimeContext): Promise<PiRuntimeResult>;
}

export interface PiRuntimeAdapterOptions {
  runner?: PiRuntimeRunner;
  now?: () => Date;
}

export class PiRuntimeAdapter {
  private readonly runner: PiRuntimeRunner;

  constructor(options: PiRuntimeAdapterOptions = {}) {
    this.runner = options.runner ?? new MetadataOnlyPiRunner(options.now);
  }

  runSession(context: PiRuntimeContext) {
    return this.runner.run(context);
  }
}

export function createPiRuntimeAdapter(options: PiRuntimeAdapterOptions = {}) {
  return new PiRuntimeAdapter(options);
}

class MetadataOnlyPiRunner implements PiRuntimeRunner {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async run(context: PiRuntimeContext): Promise<PiRuntimeResult> {
    const timestamp = this.now().toISOString();
    const title = context.workItem?.title ?? `Session ${context.session.id}`;
    const actor = context.agent ? { type: "agent" as const, id: context.agent.id, name: context.agent.name } : undefined;

    return {
      events: [
        {
          id: `event_${context.session.id}_runtime_started`,
          sessionId: context.session.id,
          sequence: 0,
          kind: "runtime",
          summary: "Pi runtime adapter accepted session",
          detail: `${context.runtime.name} prepared metadata-only execution for ${title}`,
          actor,
          metadata: {
            runtimeProvider: context.runtime.provider,
            adapter: "pi"
          },
          createdAt: timestamp
        }
      ],
      outcome: {
        id: `outcome_${context.session.id}`,
        sessionId: context.session.id,
        status: "success",
        summary: "Pi runtime adapter completed metadata-only session",
        result: {
          workItemTitle: context.workItem?.title,
          runtimeId: context.runtime.id,
          agentId: context.agent?.id
        },
        eventsUploaded: 1,
        createdAt: timestamp
      }
    };
  }
}
