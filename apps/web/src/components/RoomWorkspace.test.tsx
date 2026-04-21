import { describe, expect, it } from "vitest";
import { roomWorkspaceTabFromHash } from "./RoomWorkspace";

describe("roomWorkspaceTabFromHash", () => {
  it("restores supported room workspace tabs from the URL hash", () => {
    expect(roomWorkspaceTabFromHash("#board")).toBe("board");
    expect(roomWorkspaceTabFromHash("#sessions")).toBe("sessions");
    expect(roomWorkspaceTabFromHash("#outcomes")).toBe("outcomes");
  });

  it("falls back to chat for empty or unknown hashes", () => {
    expect(roomWorkspaceTabFromHash("")).toBe("chat");
    expect(roomWorkspaceTabFromHash("#unknown")).toBe("chat");
  });
});
