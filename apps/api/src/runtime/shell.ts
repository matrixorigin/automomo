import { spawn } from "node:child_process";
import { Outcome, Runtime, Session, SessionEvent } from "@automomo/protocol";

export async function runShellRuntime(input: {
  session: Session;
  runtime: Runtime;
  now: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}) {
  const command = input.runtime.environment.command;
  if (!command?.length) {
    throw new Error("shell runtime command is required");
  }
  const output = await runCommand({
    command,
    cwd: input.runtime.environment.workspaceRoot ?? process.cwd(),
    env: input.runtime.environment.env,
    timeoutMs: input.timeoutMs ?? 60_000,
    maxOutputBytes: input.maxOutputBytes ?? 256_000
  });
  const events: SessionEvent[] = [];
  if (output.stdout.trim()) {
    events.push({
      id: `event_${input.session.id}_stdout`,
      sessionId: input.session.id,
      sequence: 0,
      kind: "text",
      summary: output.stdout.trim().slice(0, 180),
      detail: output.stdout.trim(),
      metadata: { stream: "stdout" },
      createdAt: input.now
    });
  }
  if (output.stderr.trim()) {
    events.push({
      id: `event_${input.session.id}_stderr`,
      sessionId: input.session.id,
      sequence: events.length,
      kind: output.exitCode === 0 ? "runtime" : "failure",
      summary: output.stderr.trim().slice(0, 180),
      detail: output.stderr.trim(),
      metadata: { stream: "stderr" },
      createdAt: input.now
    });
  }
  const parsed = parseOutcome(input.session.id, output.stdout, output.exitCode, input.now, output.timedOut);
  return { events, outcome: parsed };
}

function runCommand(input: {
  command: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  maxOutputBytes: number;
}) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }>((resolve) => {
    const child = spawn(input.command[0]!, input.command.slice(1), {
      cwd: input.cwd,
      env: { PATH: process.env.PATH, ...input.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout = trimOutput(stdout + String(chunk), input.maxOutputBytes);
    });
    child.stderr.on("data", (chunk) => {
      stderr = trimOutput(stderr + String(chunk), input.maxOutputBytes);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: timedOut ? 124 : (code ?? 1), timedOut });
    });
  });
}

function trimOutput(value: string, maxBytes: number) {
  return value.length > maxBytes ? value.slice(value.length - maxBytes) : value;
}

function parseOutcome(sessionId: string, stdout: string, exitCode: number, createdAt: string, timedOut: boolean): Outcome {
  if (timedOut) {
    return failed(sessionId, "Runtime timed out", { timedOut: true }, createdAt);
  }
  const text = stdout.trim();
  const jsonText = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    const parsed = JSON.parse(jsonText) as { status?: Outcome["status"]; summary?: string; result?: Record<string, unknown> };
    return {
      id: `outcome_${sessionId}`,
      sessionId,
      status: parsed.status ?? (exitCode === 0 ? "success" : "failed"),
      summary: parsed.summary ?? (exitCode === 0 ? "Shell runtime completed" : "Shell runtime failed"),
      result: parsed.result ?? {},
      eventsUploaded: 0,
      createdAt
    };
  } catch {
    return failed(sessionId, exitCode === 0 ? "Runtime output was not structured JSON" : "Runtime command failed", { exitCode }, createdAt);
  }
}

function failed(sessionId: string, summary: string, result: Record<string, unknown>, createdAt: string): Outcome {
  return {
    id: `outcome_${sessionId}`,
    sessionId,
    status: "failed",
    summary,
    result,
    eventsUploaded: 0,
    createdAt
  };
}
