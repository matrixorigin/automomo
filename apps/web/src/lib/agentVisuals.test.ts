import { describe, expect, it } from "vitest";
import { getAgentColor, getAgentIcon, getAgentInitials } from "./agentVisuals";

describe("agentVisuals", () => {
  describe("getAgentColor", () => {
    it("uses metadata.color when present", () => {
      const color = getAgentColor({
        id: "agent_1",
        name: "Ralph",
        metadata: { color: " #22c55e " }
      });

      expect(color).toBe("#22c55e");
    });

    it("uses the fallback color when metadata color is missing", () => {
      const color = getAgentColor(
        {
          id: "agent_1",
          name: "Ralph",
          metadata: {}
        },
        { fallbackColor: "#111111" }
      );

      expect(color).toBe("#111111");
    });

    it("returns a deterministic fallback color from agent identity", () => {
      const first = getAgentColor({ id: "agent_seed", name: "Ralph", metadata: {} });
      const second = getAgentColor({ id: "agent_seed", name: "Another Name", metadata: {} });
      const third = getAgentColor({ id: "different_seed", name: "Ralph", metadata: {} });

      expect(first).toBe(second);
      expect(first).not.toBe(third);
    });
  });

  describe("getAgentIcon", () => {
    it("uses metadata.icon when present", () => {
      const icon = getAgentIcon({
        id: "agent_1",
        name: "Ralph",
        metadata: { icon: "sparkles" }
      });

      expect(icon).toBe("sparkles");
    });

    it("uses fallback icon when metadata icon is missing", () => {
      const icon = getAgentIcon(
        {
          id: "agent_1",
          name: "Ralph",
          metadata: {}
        },
        { fallbackIcon: "cpu" }
      );

      expect(icon).toBe("cpu");
    });
  });

  describe("getAgentInitials", () => {
    it("returns one-letter initials for single names", () => {
      expect(getAgentInitials("Ralph")).toBe("R");
    });

    it("returns two-letter initials for multi-word names", () => {
      expect(getAgentInitials("Backend Lead")).toBe("BL");
    });

    it("falls back to A for unknown names", () => {
      expect(getAgentInitials("")).toBe("A");
      expect(getAgentInitials("   ")).toBe("A");
    });
  });
});
