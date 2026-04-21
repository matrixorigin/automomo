"use client";

import React, { useMemo, useRef, useState } from "react";
import { findMentionQueryAtCursor, normalizeMentionName } from "../lib/mentions";

export function MentionTextarea({
  value,
  onChange,
  agentNames,
  placeholder = "Mention agents with @Ralph, ask for a plan, or leave runtime notes.",
  rows = 4,
  name = "body"
}: {
  value: string;
  onChange: (nextValue: string) => void;
  agentNames: string[];
  placeholder?: string;
  rows?: number;
  name?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cursor, setCursor] = useState(value.length);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const query = findMentionQueryAtCursor(value, cursor);
  const filteredAgents = useMemo(() => {
    if (!query) {
      return [];
    }
    const normalizedQuery = normalizeMentionName(query.query);
    const matches = agentNames.filter((agentName) =>
      normalizeMentionName(agentName).includes(normalizedQuery)
    );
    return matches.slice(0, 8);
  }, [agentNames, query]);

  const showMenu = isMenuOpen && filteredAgents.length > 0 && Boolean(query);

  function updateCursorFromTarget(target: HTMLTextAreaElement) {
    setCursor(target.selectionStart ?? target.value.length);
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
    updateCursorFromTarget(event.target);
    setIsMenuOpen(Boolean(findMentionQueryAtCursor(event.target.value, event.target.selectionStart ?? event.target.value.length)));
    setActiveIndex(0);
  }

  function handleSelect(name: string) {
    const activeQuery = findMentionQueryAtCursor(value, cursor);
    if (!activeQuery) {
      return;
    }
    const mentionToken = `@${name.replace(/\s+/g, "")}`;
    const nextValue = `${value.slice(0, activeQuery.start)}${mentionToken} ${value.slice(activeQuery.end)}`;
    const nextCursor = activeQuery.start + mentionToken.length + 1;
    onChange(nextValue);
    setCursor(nextCursor);
    setActiveIndex(0);
    setIsMenuOpen(false);

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!showMenu) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % filteredAgents.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + filteredAgents.length) % filteredAgents.length);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const choice = filteredAgents[activeIndex];
      if (choice) {
        handleSelect(choice);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setIsMenuOpen(false);
    }
  }

  function closeMenu() {
    setIsMenuOpen(false);
    setActiveIndex(0);
  }

  return (
    <div className="mention-textarea">
      <textarea
        ref={textareaRef}
        className="mention-textarea-input"
        name={name}
        rows={rows}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => updateCursorFromTarget(event.currentTarget)}
        onClick={(event) => updateCursorFromTarget(event.currentTarget)}
        onFocus={(event) => {
          updateCursorFromTarget(event.currentTarget);
          setIsMenuOpen(Boolean(findMentionQueryAtCursor(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)));
        }}
        onBlur={() => {
          setTimeout(closeMenu, 0);
        }}
        placeholder={placeholder}
        required
      />
      {showMenu ? (
        <ul className="mention-dropdown" role="listbox" aria-label="Mention suggestions">
          {filteredAgents.map((agentName, index) => (
            <li key={agentName} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={index === activeIndex ? "is-active" : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(agentName)}
              >
                @{agentName.replace(/\s+/g, "")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
