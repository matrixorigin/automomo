import {
  OrchestrationRule,
  OrchestrationTriggerSchema,
  RuleEvaluationResult,
  RuleEvaluationResultSchema,
  WorkItem
} from "@automomo/protocol";

export function evaluateOrchestrationRules(input: {
  rules: OrchestrationRule[];
  workItem: WorkItem;
  trigger: unknown;
}): RuleEvaluationResult {
  const trigger = OrchestrationTriggerSchema.parse(input.trigger);
  const rules = [...input.rules]
    .filter((rule) => rule.codebaseId === input.workItem.codebaseId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const misses: string[] = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      misses.push(`${rule.id}: disabled`);
      continue;
    }
    if (rule.trigger !== trigger) {
      misses.push(`${rule.id}: trigger ${rule.trigger} did not match ${trigger}`);
      continue;
    }
    const mismatch = firstMismatch(rule.match, input.workItem);
    if (mismatch) {
      misses.push(`${rule.id}: ${mismatch}`);
      continue;
    }
    return RuleEvaluationResultSchema.parse({
      matched: true,
      ruleId: rule.id,
      reason: `matched ${rule.name} for ${trigger}`,
      agentId: rule.agentId,
      runtimeId: rule.runtimeId,
      requiresHumanApproval: rule.humanApproval === "before_start",
      metadata: {
        trigger,
        humanApproval: rule.humanApproval
      }
    });
  }

  return RuleEvaluationResultSchema.parse({
    matched: false,
    reason: misses[0] ?? "no enabled rule matched",
    metadata: { trigger, misses }
  });
}

function firstMismatch(match: Record<string, unknown>, workItem: WorkItem) {
  for (const [key, expected] of Object.entries(match)) {
    if (key === "labels") {
      const values = toArray(expected);
      if (!values.some((value) => workItem.labels.includes(String(value)))) {
        return "labels did not match";
      }
      continue;
    }
    if (key === "connectorType") {
      if (!matchesValue(workItem.connector?.type, expected)) return "connector type did not match";
      continue;
    }
    if (key === "metadata" && isRecord(expected)) {
      for (const [metadataKey, metadataValue] of Object.entries(expected)) {
        if (!matchesValue(workItem.metadata[metadataKey], metadataValue)) {
          return `metadata.${metadataKey} did not match`;
        }
      }
      continue;
    }
    const actual = workItemField(workItem, key);
    if (!matchesValue(actual, expected)) {
      return `${key} did not match`;
    }
  }
  return undefined;
}

function workItemField(workItem: WorkItem, key: string): unknown {
  if (key in workItem) {
    return workItem[key as keyof WorkItem];
  }
  return workItem.connector?.metadata?.[key] ?? workItem.metadata[key];
}

function matchesValue(actual: unknown, expected: unknown) {
  return toArray(expected).some((value) => String(actual) === String(value));
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
