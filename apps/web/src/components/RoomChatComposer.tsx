"use client";

import React, { useState } from "react";

export function RoomChatComposer({
  roomId,
  agents
}: {
  roomId: string;
  agents: { id: string; name: string }[];
}) {
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("Operator");

  function appendMention(name: string) {
    const mention = `@${name.replace(/\s+/g, "")}`;
    setBody((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${mention} `);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = body.trim();
    if (!message) return;
    const response = await fetch(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        author: { type: "human", name: authorName.trim() || "Operator" },
        body: message
      })
    });
    if (!response.ok) {
      throw new Error(`automomo mutation /api/rooms/${roomId}/messages failed with ${response.status}`);
    }
    window.location.reload();
  }

  return (
    <form className="chat-composer" data-json-endpoint={`/api/rooms/${roomId}/messages`} onSubmit={submit}>
      <div className="mention-bar" aria-label="Mention agents">
        {agents.map((agent) => (
          <button key={agent.id} type="button" onClick={() => appendMention(agent.name)}>
            @{agent.name}
          </button>
        ))}
        {agents.length > 1 ? (
          <button type="button" onClick={() => agents.forEach((agent) => appendMention(agent.name))}>
            @all
          </button>
        ) : null}
      </div>
      <label>
        <span>Author</span>
        <input name="authorName" value={authorName} onChange={(event) => setAuthorName(event.target.value)} />
      </label>
      <label className="wide">
        <span>Message</span>
        <textarea
          name="body"
          rows={4}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Mention agents with @Ralph, ask for a plan, or leave runtime notes."
          required
        />
      </label>
      <button type="submit">Send message</button>
    </form>
  );
}
