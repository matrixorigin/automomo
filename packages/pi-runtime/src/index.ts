import {
  Agent,
  OutcomeArtifactInput,
  Outcome,
  PiRuntimeConfig,
  PiRuntimeConfigSchema,
  RuntimeFinalOutputSchema,
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
  artifacts?: OutcomeArtifactInput[];
}

export interface PiRuntimeRunner {
  run(context: PiRuntimeContext): Promise<PiRuntimeResult>;
}

export interface PiRuntimeAdapterOptions {
  runner?: PiRuntimeRunner;
  now?: () => Date;
  config?: Partial<PiRuntimeConfig>;
  sessionFactory?: PiSessionFactory;
}

export type CreateAgentSessionLike = (options?: Record<string, unknown>) => Promise<{
  session: {
    subscribe?: (listener: (event: unknown) => void) => () => void;
    prompt: (prompt: string) => Promise<void>;
    agent?: { state?: { messages?: unknown[] } };
  };
}>;

export class PiRuntimeAdapter {
  private readonly runner: PiRuntimeRunner;

  constructor(options: PiRuntimeAdapterOptions = {}) {
    const config = PiRuntimeConfigSchema.parse(options.config ?? {});
    this.runner =
      options.runner ??
      (config.mode === "sdk" ? createPiSdkRunner({ config, now: options.now, sessionFactory: options.sessionFactory }) : createMetadataOnlyRunner({ now: options.now }));
  }

  runSession(context: PiRuntimeContext) {
    return this.runner.run(context);
  }
}

export function createPiRuntimeAdapter(options: PiRuntimeAdapterOptions = {}) {
  return new PiRuntimeAdapter(options);
}

export function createMetadataOnlyRunner(options: { now?: () => Date } = {}) {
  return new MetadataOnlyPiRunner(options.now);
}

export interface PiSessionFactoryInput {
  prompt: string;
  context: PiRuntimeContext;
  config: PiRuntimeConfig;
}

export interface PiSessionFactoryResult {
  events?: unknown[];
  finalText: string;
}

export type PiSessionFactory = (input: PiSessionFactoryInput) => Promise<PiSessionFactoryResult>;

export function createPiSdkRunner(options: {
  config?: Partial<PiRuntimeConfig>;
  now?: () => Date;
  sessionFactory?: PiSessionFactory;
} = {}): PiRuntimeRunner {
  const config = PiRuntimeConfigSchema.parse({ mode: "sdk", ...options.config });
  const now = options.now ?? (() => new Date());
  const sessionFactory = options.sessionFactory ?? createDefaultPiSessionFactory();

  return {
    async run(context) {
      const createdAt = now().toISOString();
      const prompt = composePiPrompt(context);
      const session = await withTimeout(
        sessionFactory({ prompt, context, config }),
        config.timeoutMs,
        context.session.id,
        createdAt
      );
      if ("timedOut" in session) {
        return session.result;
      }

      const events = (session.events ?? [])
        .map((event, index) =>
          mapPiEvent(event, {
            sessionId: context.session.id,
            sequence: index,
            createdAt,
            actor: context.agent ? { type: "agent", id: context.agent.id, name: context.agent.name } : undefined
          })
        )
        .filter((event): event is SessionEvent => event !== undefined);
      const decoded = decodePiOutcome({
        sessionId: context.session.id,
        text: session.finalText,
        createdAt,
        eventOffset: events.length
      });

      return {
        events: [...events, ...decoded.events],
        outcome: {
          ...decoded.outcome,
          eventsUploaded: events.length + decoded.events.length
        },
        artifacts: decoded.artifacts
      };
    }
  };
}

export function composePiPrompt(context: PiRuntimeContext) {
  const orchestration = context.session.metadata.orchestration;
  const room = roomMetadata(context.session.metadata.room);
  const recentContext = recentChatContext(context.session.metadata.context);
  const workspaceRoot = context.runtime.environment.workspaceRoot;
  const agentName = context.agent?.name ?? "Local agent";
  const parts = [
    `You are ${agentName}, an automomo local room agent.`,
    `Run: ${context.session.id}`,
    `Environment: ${context.runtime.name} (${context.runtime.provider})`,
    workspaceRoot ? `Workspace root: ${workspaceRoot}` : "Workspace root: unavailable",
    room ? `Room: ${room.name}${room.description ? `\nRoom description: ${room.description}` : ""}` : undefined,
    context.agent?.instructions ? `Agent instructions:\n${context.agent.instructions}` : undefined,
    context.agent?.skills.length ? `Skills: ${context.agent.skills.join(", ")}` : undefined,
    recentContext.length ? `Recent chat context:\n${recentContext.join("\n")}` : undefined,
    context.workItem ? `User request:\n${context.workItem.body}` : "User request: unavailable",
    context.workItem ? `Work item: ${context.workItem.title}` : undefined,
    context.workItem?.labels.length ? `Labels: ${context.workItem.labels.join(", ")}` : undefined,
    orchestration ? `Orchestration: ${JSON.stringify(orchestration)}` : undefined,
    "Return a final fenced JSON object matching this shape:",
    '{"status":"success|failed|needs_human","summary":"short room message","result":{},"artifacts":[{"type":"plan|patch|review|pr|document|log","title":"Human-readable title","content":"Reviewable details","url":null,"taskId":null,"metadata":{}}]}',
    "Use artifacts for reviewable outputs: plans, patch summaries, review notes, PR links, longer documents, and validation logs. Keep chat summaries short.",
    "Do not include credentials or environment values in the final result."
  ];
  return parts.filter(Boolean).join("\n\n");
}

function roomMetadata(value: unknown): { name: string; description: string } | undefined {
  if (!isRecord(value) || typeof value.name !== "string") {
    return undefined;
  }
  return {
    name: value.name,
    description: typeof value.description === "string" ? value.description : ""
  };
}

function recentChatContext(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!isRecord(entry) || typeof entry.content !== "string") {
        return undefined;
      }
      const authorName = typeof entry.authorName === "string" ? entry.authorName : "Participant";
      return `${authorName}: ${entry.content}`;
    })
    .filter((line): line is string => Boolean(line));
}

export function mapPiEvent(
  event: unknown,
  input: {
    sessionId: string;
    sequence: number;
    createdAt: string;
    actor?: SessionEvent["actor"];
  }
): SessionEvent | undefined {
  const record = isRecord(event) ? event : {};
  const type = typeof record.type === "string" ? record.type : "unknown";
  const text = typeof record.text === "string" ? record.text : undefined;
  const name = typeof record.name === "string" ? record.name : undefined;
  const error = typeof record.error === "string" ? record.error : undefined;
  const kind =
    type.includes("tool") ? "tool" : type.includes("error") || error ? "failure" : type.includes("text") ? "text" : "runtime";
  const summary =
    kind === "tool"
      ? `${type.includes("result") ? "Tool result" : "Tool call"}: ${name ?? "tool"}`
      : kind === "failure"
        ? error ?? "Pi runtime reported a failure"
        : text
          ? text.slice(0, 180)
          : `Pi event: ${type}`;

  return {
    id: `event_${input.sessionId}_${input.sequence}`,
    sessionId: input.sessionId,
    sequence: input.sequence,
    kind,
    summary,
    detail: text && text.length > 180 ? text : undefined,
    actor: input.actor,
    metadata: {
      piEventType: type
    },
    createdAt: input.createdAt
  };
}

export function decodePiOutcome(input: {
  sessionId: string;
  text: string;
  createdAt: string;
  eventOffset?: number;
}): { outcome: Outcome; events: SessionEvent[]; artifacts: OutcomeArtifactInput[] } {
  const jsonText = extractJson(input.text);
  if (!jsonText) {
    return failedDecode(input, "Pi runtime did not return JSON");
  }

  try {
    const parsed = RuntimeFinalOutputSchema.parse(JSON.parse(jsonText));
    return {
      outcome: {
        id: `outcome_${input.sessionId}`,
        sessionId: input.sessionId,
        status: parsed.status,
        summary: parsed.summary,
        result: parsed.result,
        eventsUploaded: 0,
        createdAt: input.createdAt
      },
      events: [],
      artifacts: parsed.artifacts
    };
  } catch (err) {
    return failedDecode(input, err instanceof Error ? err.message : "Pi runtime returned malformed JSON");
  }
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

function extractJson(text: string) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return undefined;
}

function failedDecode(input: { sessionId: string; createdAt: string; eventOffset?: number }, reason: string) {
  const sequence = input.eventOffset ?? 0;
  const event: SessionEvent = {
    id: `event_${input.sessionId}_decode_failure`,
    sessionId: input.sessionId,
    sequence,
    kind: "failure",
    summary: "Pi runtime outcome decode failed",
    detail: reason,
    metadata: { reason },
    createdAt: input.createdAt
  };
  return {
    outcome: {
      id: `outcome_${input.sessionId}`,
      sessionId: input.sessionId,
      status: "failed" as const,
      summary: "Pi runtime returned malformed output",
      result: { decodeFailure: reason },
      eventsUploaded: 1,
      createdAt: input.createdAt
    },
    events: [event],
    artifacts: []
  };
}

async function withTimeout(
  promise: Promise<PiSessionFactoryResult>,
  timeoutMs: number | undefined,
  sessionId: string,
  createdAt: string
): Promise<PiSessionFactoryResult | { timedOut: true; result: PiRuntimeResult }> {
  if (!timeoutMs) {
    return promise;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<{ timedOut: true; result: PiRuntimeResult }>((resolve) => {
        timeout = setTimeout(() => {
          const failed = failedDecode({ sessionId, createdAt }, `Timed out after ${timeoutMs}ms`);
          resolve({ timedOut: true, result: failed });
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function createPiSdkSessionFactory(options: { createAgentSession: CreateAgentSessionLike }): PiSessionFactory {
  return async ({ prompt, context, config }) => {
    const events: unknown[] = [];
    const cwd = config.cwd ?? context.runtime.environment.workspaceRoot;
    const { session } = await options.createAgentSession({
      cwd,
      thinkingLevel: config.thinkingLevel
    });
    const unsubscribe = session.subscribe?.((event) => {
      events.push(event);
    });
    try {
      await session.prompt(prompt);
    } finally {
      unsubscribe?.();
    }
    return {
      events,
      finalText: finalTextFromMessages(session.agent?.state?.messages) ?? ""
    };
  };
}

function createDefaultPiSessionFactory(): PiSessionFactory {
  return async (input) => {
    const mod = await import("@mariozechner/pi-coding-agent");
    const createAgentSession = (mod as { createAgentSession?: unknown }).createAgentSession;
    if (typeof createAgentSession !== "function") {
      throw new Error("Pi Mono SDK createAgentSession is unavailable");
    }
    return createPiSdkSessionFactory({ createAgentSession: createAgentSession as CreateAgentSessionLike })(input);
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finalTextFromMessages(messages: unknown[] | undefined) {
  const lastAssistant = [...(messages ?? [])].reverse().find((message) => isRecord(message) && message.role === "assistant");
  if (!isRecord(lastAssistant)) {
    return undefined;
  }
  const content = lastAssistant.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return undefined;
}
