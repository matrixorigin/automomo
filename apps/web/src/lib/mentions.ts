export interface MentionMatch {
  start: number;
  end: number;
  token: string;
  agentName: string;
}

export interface MentionQuery {
  query: string;
  start: number;
  end: number;
}

export function normalizeMentionName(name: string) {
  return name.trim().replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();
}

export function findMentionMatches(content: string, agentNames: string[]): MentionMatch[] {
  if (!content || agentNames.length === 0) {
    return [];
  }

  const normalizedAgents = new Map<string, string>();
  for (const name of agentNames) {
    const normalized = normalizeMentionName(name);
    if (normalized && !normalizedAgents.has(normalized)) {
      normalizedAgents.set(normalized, name);
    }
  }

  const matches: MentionMatch[] = [];
  const mentionPattern = /@[A-Za-z0-9_-]+/g;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(content)) !== null) {
    const token = match[0];
    const start = match.index;
    const end = start + token.length;
    if (!hasValidMentionBoundary(content, start)) {
      continue;
    }
    const normalized = normalizeMentionName(token);
    const agentName = normalizedAgents.get(normalized);
    if (!agentName) {
      continue;
    }
    matches.push({ start, end, token, agentName });
  }

  return matches;
}

export function findMentionQueryAtCursor(content: string, cursor: number): MentionQuery | null {
  if (cursor < 0 || cursor > content.length) {
    return null;
  }

  const leading = content.slice(0, cursor);
  const atIndex = leading.lastIndexOf("@");
  if (atIndex < 0 || !hasValidMentionBoundary(content, atIndex)) {
    return null;
  }

  const query = leading.slice(atIndex + 1);
  if (!/^[A-Za-z0-9_-]*$/.test(query)) {
    return null;
  }

  return { query, start: atIndex, end: cursor };
}

function hasValidMentionBoundary(content: string, mentionStart: number) {
  if (mentionStart === 0) {
    return true;
  }
  const previous = content[mentionStart - 1] ?? "";
  return !/[A-Za-z0-9_]/.test(previous);
}
