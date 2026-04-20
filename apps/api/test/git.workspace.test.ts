import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareWorkspace } from "../src/git/workspace";

const now = "2026-04-20T08:00:00.000Z";

describe("workspace preparation", () => {
  it("uses local codebase roots read-only by default", () => {
    const workspace = prepareWorkspace({
      sessionId: "session_1",
      codebase: {
        id: "codebase_1",
        name: "automomo",
        provider: "local",
        workspaceRoot: "/tmp/automomo",
        status: "active",
        metadata: {},
        createdAt: now,
        updatedAt: now
      }
    });

    expect(workspace).toMatchObject({ workspaceRoot: "/tmp/automomo", runRoot: "/tmp/automomo", readOnly: true });
  });

  it("creates cache and run roots for non-local codebases", () => {
    const dir = mkdtempSync(join(tmpdir(), "automomo-workspace-"));
    try {
      const workspace = prepareWorkspace({
        sessionId: "session_1",
        root: dir,
        codebase: {
          id: "codebase_1",
          name: "automomo",
          provider: "git",
          status: "active",
          metadata: {},
          createdAt: now,
          updatedAt: now
        }
      });

      expect(workspace.workspaceRoot).toContain("workspaces/codebase_1");
      expect(workspace.runRoot).toContain("runs/session_1");
      expect(workspace.readOnly).toBe(false);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
