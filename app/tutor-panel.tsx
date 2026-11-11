"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Level } from "../lib/levels";

const MAX_QUESTION_LENGTH = 500;

type Message = { role: "tutor" | "user" | "error"; text: string };

async function callTutor(body: Record<string, string>) {
  const res = await fetch("/api/tutor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      res.status === 429
        ? "Daily tutor limit reached. Try again tomorrow."
        : data.error ?? "Tutor unavailable right now.",
    );
  }
  return data.answer as string;
}

export default function TutorPanel({
  topic,
  level,
  onClose,
}: {
  topic: string | null;
  level: Level;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const open = topic !== null;

  async function load(request: Record<string, string>, userText?: string) {
    setLoading(true);
    if (userText) setMessages((m) => [...m, { role: "user", text: userText }]);
    try {
      const answer = await callTutor(request);
      setMessages((m) => [...m, { role: "tutor", text: answer }]);
    } catch (error) {
      setMessages((m) => [
        ...m,
        { role: "error", text: error instanceof Error ? error.message : "Tutor unavailable right now." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const startedRef = useRef(false);

  // The panel is re-mounted per topic, so this loads one lesson overview per open
  useEffect(() => {
    // Strict Mode runs effects twice in dev; the ref keeps it to one request
    if (startedRef.current) return;
    startedRef.current = true;
    if (topic) load({ topic, level, mode: "lesson" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || loading || !topic) return;
    setQuestion("");
    load({ topic, level, question: text }, text);
  }

  return (
    <aside
      className={`drawer${open ? " open" : ""}`}
      aria-hidden={!open}
      aria-label={topic ? `Tutor for ${topic}` : "Tutor"}
    >
      {topic && (
        <>
          <header className="drawer-header">
            <div>
              <h2>{topic}</h2>
              <span className="level-chip" aria-label={`Current level: ${level}`}>
                {level}
              </span>
            </div>
            <button type="button" className="link-button" onClick={onClose} aria-label="Close tutor">
              ✕
            </button>
          </header>

          <div className="messages" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`bubble bubble-${m.role}`}>
                {m.role === "tutor" ? (
                  <div className="markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                  </div>
                ) : (
                  m.text
                )}
              </div>
            ))}
            {loading && <div className="bubble bubble-tutor typing">Thinking…</div>}
            <div ref={endRef} />
          </div>

          <p className="privacy-notice tutor-privacy">Topics and questions are sent to Google Gemini. Don&apos;t include sensitive or confidential information. AI responses can be inaccurate or outdated; verify important details with reliable sources.</p>
          <form onSubmit={ask} className="composer">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) ask(e);
              }}
              maxLength={MAX_QUESTION_LENGTH}
              rows={2}
              placeholder={`Ask about ${topic}…`}
            />
            <button type="submit" className="primary" disabled={loading || !question.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </aside>
  );
}
