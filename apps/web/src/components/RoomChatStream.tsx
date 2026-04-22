"use client";

import type { Agent, RoomMessage } from "@automomo/protocol";
import React, { Fragment, useMemo, useState } from "react";
import { findMentionMatches } from "../lib/mentions";
import { AgentAvatar } from "./AgentAvatar";
import { MentionTextarea } from "./MentionTextarea";

export function RoomChatStream({
  roomId,
  initialMessages,
  agents = [],
  agentNames
}: {
  roomId: string;
  initialMessages: RoomMessage[];
  agents?: Pick<Agent, "id" | "name" | "metadata">[];
  agentNames?: string[];
}) {
  const [messages, setMessages] = useState(() => [...initialMessages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const orderedAgentNames = useMemo(
    () => [...new Set(agentNames ?? agents.map((agent) => agent.name))],
    [agentNames, agents]
  );
  const agentsByName = useMemo(
    () => new Map(agents.map((agent) => [agent.name.toLowerCase(), agent])),
    [agents]
  );

  async function sendCurrentMessage() {
    const messageBody = body.trim();
    if (!messageBody || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          author: { type: "human", name: "Operator" },
          body: messageBody
        })
      });
      if (!response.ok) {
        throw new Error(`automomo mutation /api/rooms/${roomId}/messages failed with ${response.status}`);
      }
      const payload = (await response.json()) as { roomMessage?: RoomMessage };
      if (!payload.roomMessage) {
        throw new Error(`automomo mutation /api/rooms/${roomId}/messages returned no roomMessage`);
      }
      const roomMessage = payload.roomMessage;
      setMessages((current) => [...current, roomMessage]);
      setBody("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendCurrentMessage();
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendCurrentMessage();
    }
  }

  return (
    <section className="room-chat-stream" aria-label="Room chat stream">
      <div className="message-thread" aria-label="Room messages">
        {messages.length === 0 ? <p className="message-empty">No messages yet. Start the room conversation.</p> : null}
        {messages.map((message) => {
          const agent = message.author.type === "agent" ? agentsByName.get(message.author.name.toLowerCase()) : undefined;
          return (
            <article className={`message-row message-${message.author.type}`} key={message.id}>
              <MessageAvatar author={message.author} agent={agent} />
              <div className="message-row-body">
                <header>
                  <strong>{formatAuthor(message.author)}</strong>
                  <span>{formatMessageTime(message.createdAt)}</span>
                </header>
                <p>{renderBodyWithMentions(message.body, orderedAgentNames)}</p>
              </div>
            </article>
          );
        })}
      </div>
      {error ? (
        <p className="chat-error" role="alert">
          {error}
        </p>
      ) : null}
      <form className="chat-composer" data-json-endpoint={`/api/rooms/${roomId}/messages`} onSubmit={submit}>
        <div className="chat-composer-field">
          <MentionTextarea
            value={body}
            onChange={setBody}
            onKeyDown={handleComposerKeyDown}
            agentNames={orderedAgentNames}
            placeholder="Message this room..."
            rows={1}
          />
        </div>
        <button className="chat-send-button" type="submit" disabled={isSending || !body.trim()} aria-label="Send message">
          {isSending ? "..." : "Send"}
        </button>
      </form>
    </section>
  );
}

function formatAuthor(author: RoomMessage["author"]) {
  if (author.type === "system") {
    return author.name || "automomo";
  }
  return author.name || "Operator";
}

function formatMessageTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageAvatar({
  author,
  agent
}: {
  author: RoomMessage["author"];
  agent?: Pick<Agent, "id" | "name" | "metadata">;
}) {
  if (agent) {
    return <AgentAvatar agent={agent} />;
  }
  const label = author.type === "system" ? "automomo" : author.name || "Operator";
  const initials = author.type === "system" ? "A" : getInitials(label);
  const ariaLabel = author.type === "human" ? `Human ${label}` : author.type === "agent" ? `Agent ${label}` : label;
  return (
    <span className={`message-avatar message-avatar-${author.type}`} aria-label={ariaLabel}>
      {initials}
    </span>
  );
}

function getInitials(name: string) {
  const chunks = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (chunks.length === 0) {
    return "?";
  }
  return chunks.map((chunk) => chunk[0]?.toUpperCase() ?? "").join("");
}

function renderBodyWithMentions(body: string, agentNames: string[]) {
  const matches = findMentionMatches(body, agentNames);
  if (matches.length === 0) {
    return body;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      parts.push(<Fragment key={`text-${cursor}`}>{body.slice(cursor, match.start)}</Fragment>);
    }
    parts.push(
      <span className="mention-token" key={`mention-${match.start}`}>
        {body.slice(match.start, match.end)}
      </span>
    );
    cursor = match.end;
  }
  if (cursor < body.length) {
    parts.push(<Fragment key={`text-${cursor}`}>{body.slice(cursor)}</Fragment>);
  }
  return parts;
}
