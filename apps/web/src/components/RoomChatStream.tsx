"use client";

import type { RoomMessage } from "@automomo/protocol";
import React, { Fragment, useMemo, useState } from "react";
import { findMentionMatches } from "../lib/mentions";
import { MentionTextarea } from "./MentionTextarea";

export function RoomChatStream({
  roomId,
  initialMessages,
  agentNames
}: {
  roomId: string;
  initialMessages: RoomMessage[];
  agentNames: string[];
}) {
  const [messages, setMessages] = useState(() => [...initialMessages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  const [authorName, setAuthorName] = useState("Operator");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const orderedAgentNames = useMemo(() => [...new Set(agentNames)], [agentNames]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
          author: { type: "human", name: authorName.trim() || "Operator" },
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

  return (
    <section className="room-chat-stream" aria-label="Room chat stream">
      <form className="chat-composer" data-json-endpoint={`/api/rooms/${roomId}/messages`} onSubmit={submit}>
        <label>
          <span>Author</span>
          <input name="authorName" value={authorName} onChange={(event) => setAuthorName(event.target.value)} />
        </label>
        <label className="wide">
          <span>Message</span>
          <MentionTextarea value={body} onChange={setBody} agentNames={orderedAgentNames} />
        </label>
        <button type="submit" disabled={isSending}>
          {isSending ? "Sending..." : "Send message"}
        </button>
      </form>
      {error ? (
        <p className="chat-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="message-thread" aria-label="Room messages">
        {messages.map((message) => (
          <article className={`message-row message-${message.author.type}`} key={message.id}>
            <div>
              <strong>{formatAuthor(message.author)}</strong>
              <span>{message.createdAt}</span>
            </div>
            <p>{renderBodyWithMentions(message.body, orderedAgentNames)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatAuthor(author: RoomMessage["author"]) {
  return author.type === "agent" ? `Agent ${author.name}` : author.type === "human" ? `Human ${author.name}` : author.name;
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
