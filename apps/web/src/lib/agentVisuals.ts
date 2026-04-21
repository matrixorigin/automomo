import type { Agent } from "@automomo/protocol";

type AgentVisualSource = Pick<Agent, "id" | "name" | "metadata">;

type AgentColorOptions = {
  fallbackColor?: string;
};

type AgentIconOptions = {
  fallbackIcon?: string;
};

const DEFAULT_ICON = "robot";
const DEFAULT_COLOR = "#3B82F6";
const FALLBACK_COLORS = ["#3B82F6", "#14B8A6", "#F59E0B", "#EF4444", "#8B5CF6", "#10B981", "#0EA5E9", "#F97316"];

export function getAgentColor(agent: AgentVisualSource, options: AgentColorOptions = {}): string {
  const metadataColor = readMetadataString(agent, "color");
  if (metadataColor) {
    return metadataColor;
  }

  const fallbackColor = options.fallbackColor?.trim();
  if (fallbackColor) {
    return fallbackColor;
  }

  return FALLBACK_COLORS[colorIndex(agent.id || agent.name)] ?? DEFAULT_COLOR;
}

export function getAgentIcon(agent: AgentVisualSource, options: AgentIconOptions = {}): string {
  const metadataIcon = readMetadataString(agent, "icon");
  if (metadataIcon) {
    return metadataIcon;
  }

  const fallbackIcon = options.fallbackIcon?.trim();
  if (fallbackIcon) {
    return fallbackIcon;
  }

  return DEFAULT_ICON;
}

export function getAgentInitials(name: string | null | undefined): string {
  const value = name?.trim() ?? "";
  if (!value) {
    return "A";
  }

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const firstWord = words[0];
    return firstWord ? firstWord.slice(0, 1).toUpperCase() : "A";
  }

  const first = words[0]?.slice(0, 1) ?? "";
  const second = words[1]?.slice(0, 1) ?? "";
  return `${first}${second}`.toUpperCase();
}

function readMetadataString(agent: AgentVisualSource, key: "color" | "icon"): string | undefined {
  const value = agent.metadata[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function colorIndex(seedSource: string): number {
  const seed = seedSource.trim() || "agent";
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash % FALLBACK_COLORS.length;
}
