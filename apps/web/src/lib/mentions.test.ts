import { describe, expect, it } from "vitest";
import { findMentionMatches, findMentionQueryAtCursor, normalizeMentionName } from "./mentions";

describe("normalizeMentionName", () => {
  it("normalizes names for mention matching", () => {
    expect(normalizeMentionName(" Ralph ")).toBe("ralph");
    expect(normalizeMentionName("@Backend Lead")).toBe("backendlead");
    expect(normalizeMentionName("Nova-2")).toBe("nova-2");
    expect(normalizeMentionName("")).toBe("");
  });
});

describe("findMentionMatches", () => {
  const agents = ["Ralph", "Nova", "Backend Lead"];

  it("matches @Ralph mentions at token boundaries", () => {
    const matches = findMentionMatches("@Ralph please inspect", agents);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ token: "@Ralph", agentName: "Ralph" });
  });

  it("matches mentions wrapped in punctuation", () => {
    const wrapped = findMentionMatches("Please check (@Ralph) now", agents);
    const bold = findMentionMatches("**@Ralph** can you review?", agents);

    expect(wrapped).toHaveLength(1);
    expect(wrapped[0]?.token).toBe("@Ralph");
    expect(bold).toHaveLength(1);
    expect(bold[0]?.token).toBe("@Ralph");
  });

  it("does not match email addresses", () => {
    expect(findMentionMatches("reach me at name@example.com", agents)).toHaveLength(0);
  });

  it("does not match unknown agents", () => {
    expect(findMentionMatches("@Unknown can you help?", agents)).toHaveLength(0);
  });

  it("matches normalized multi-word names", () => {
    const matches = findMentionMatches("@BackendLead has context", agents);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ token: "@BackendLead", agentName: "Backend Lead" });
  });
});

describe("findMentionQueryAtCursor", () => {
  it("returns query details when cursor is in mention token", () => {
    expect(findMentionQueryAtCursor("Ask @Ra", 7)).toEqual({
      query: "Ra",
      start: 4,
      end: 7
    });
  });

  it("returns null for non-mention or invalid boundaries", () => {
    expect(findMentionQueryAtCursor("email name@example.com", 18)).toBeNull();
    expect(findMentionQueryAtCursor("plain text", 5)).toBeNull();
  });
});
