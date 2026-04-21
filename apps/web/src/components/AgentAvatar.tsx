import type { Agent } from "@automomo/protocol";
import React from "react";
import { getAgentColor, getAgentIcon, getAgentInitials } from "../lib/agentVisuals";

function Avatar({
  initials,
  color,
  title,
  icon
}: {
  initials: string;
  color: string;
  title: string;
  icon: string;
}) {
  return (
    <span
      className="agent-avatar"
      data-agent-icon={icon}
      title={title}
      style={{
        alignItems: "center",
        background: color,
        borderRadius: "999px",
        color: "#fff",
        display: "inline-flex",
        fontSize: "0.75rem",
        fontWeight: 700,
        height: "1.75rem",
        justifyContent: "center",
        letterSpacing: "0",
        textTransform: "uppercase",
        width: "1.75rem"
      }}
    >
      {initials}
    </span>
  );
}

export function AgentAvatar({
  agent,
  fallbackColor,
  fallbackIcon
}: {
  agent: Pick<Agent, "id" | "name" | "metadata">;
  fallbackColor?: string;
  fallbackIcon?: string;
}) {
  const color = getAgentColor(agent, { fallbackColor });
  const icon = getAgentIcon(agent, { fallbackIcon });
  const initials = getAgentInitials(agent.name);

  return <Avatar initials={initials} color={color} title={`Agent ${agent.name} (${icon})`} icon={icon} />;
}
