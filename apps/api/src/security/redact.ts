const secretKeyPattern = /(token|secret|key|password|credential|cookie|authorization)/i;

export function redactSecrets<T>(value: T, secretRefs: string[] = []): T {
  const secretRefSet = new Set(secretRefs.map((item) => item.toLowerCase()));
  return redactValue(value, secretRefSet) as T;
}

function redactValue(value: unknown, secretRefs: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, secretRefs));
  }
  if (!isRecord(value)) {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (secretKeyPattern.test(key) || secretRefs.has(key.toLowerCase())) {
      next[key] = "[REDACTED]";
    } else {
      next[key] = redactValue(item, secretRefs);
    }
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
