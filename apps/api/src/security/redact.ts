const secretKeyPattern = /(token|secret|key|password|credential|cookie|authorization)/i;

export function redactSecrets<T>(value: T, secretRefs: string[] = [], secretValues: string[] = []): T {
  const secretRefSet = new Set(secretRefs.map((item) => item.toLowerCase()));
  const values = uniqueSecretValues(secretValues);
  return redactValue(value, secretRefSet, values) as T;
}

function redactValue(value: unknown, secretRefs: Set<string>, secretValues: string[]): unknown {
  if (typeof value === "string") {
    return redactString(value, secretValues);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, secretRefs, secretValues));
  }
  if (!isRecord(value)) {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (secretKeyPattern.test(key) || secretRefs.has(key.toLowerCase())) {
      next[key] = "[REDACTED]";
    } else {
      next[key] = redactValue(item, secretRefs, secretValues);
    }
  }
  return next;
}

function redactString(value: string, secretValues: string[]) {
  let redacted = value;
  for (const secret of secretValues) {
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted;
}

function uniqueSecretValues(values: string[]) {
  return [...new Set(values.filter((value) => value.length > 0))].sort((a, b) => b.length - a.length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
