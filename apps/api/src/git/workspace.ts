import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Codebase } from "@automomo/protocol";

export interface PreparedWorkspace {
  codebaseId: string;
  workspaceRoot: string;
  runRoot: string;
  readOnly: boolean;
}

export function prepareWorkspace(input: { codebase: Codebase; sessionId: string; root?: string }): PreparedWorkspace {
  if (input.codebase.provider === "local") {
    if (!input.codebase.workspaceRoot) {
      throw new Error("local codebase workspaceRoot is required");
    }
    return {
      codebaseId: input.codebase.id,
      workspaceRoot: input.codebase.workspaceRoot,
      runRoot: input.codebase.workspaceRoot,
      readOnly: true
    };
  }

  const root = input.root ?? join(process.cwd(), ".automomo");
  const workspaceRoot = join(root, "workspaces", input.codebase.id);
  const runRoot = join(root, "runs", input.sessionId);
  mkdirSync(workspaceRoot, { recursive: true });
  mkdirSync(runRoot, { recursive: true });
  return { codebaseId: input.codebase.id, workspaceRoot, runRoot, readOnly: false };
}
