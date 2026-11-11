"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Level } from "../lib/levels";
import { socraticPayloadSchema, type SocraticPayload, type TutorHistory } from "../lib/types/socratic";
import SocraticGraph from "./socratic-graph";

const MAX_QUESTION_LENGTH = 500;

type Message =
  | { role: "tutor"; payload: SocraticPayload }
  | { role: "user" | "error"; text: string };

type TutorRequest = { topicId: string; level: Level; mode: "lesson" | "chat"; question?: string; history: TutorHistory };

async function callTutor(body: TutorRequest) {
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
  const parsed = socraticPayloadSchema.safeParse(data.payload);
  if (!parsed.success) throw new Error("The tutor response could not be displayed. Please try again.");
  return parsed.data;
}

export default function TutorPanel({
  topicId,
  topic,
  level,
  onClose,
}: {
  topicId: string | null;
  topic: string | null;
  level: Level;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<TutorHistory>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDetailsElement>(null);
  const open = topic !== null;

  async function load(request: TutorRequest, userText?: string) {
    setLoading(true);
    if (userText) {
      setMessages((m) => [...m, { role: "user", text: userText }]);
      setHistory((previous) => [...previous, { role: "user", text: userText }]);
    }
    try {
      const payload = await callTutor(request);
      setMessages((m) => [...m, { role: "tutor", payload }]);
      setHistory((previous) => [...previous, { role: "tutor", payload }]);
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
    if (topic && topicId) load({ topicId, level, mode: "lesson", history: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (noticeRef.current?.open) {
        noticeRef.current.open = false;
        noticeRef.current.querySelector("summary")?.focus();
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || loading || !topic || !topicId) return;
    setQuestion("");
    load({ topicId, level, mode: "chat", question: text, history }, text);
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
            <div className="drawer-actions">
              <details className="tutor-notice" ref={noticeRef}>
                <summary>AI &amp; privacy</summary>
                <p className="privacy-notice tutor-notice-content">Your topic and active conversation are sent to Google Gemini. Names of recently studied topics may also be sent to check their relevance; diagram answers and diagram details are sent for assessment. Don&apos;t include sensitive or confidential information. AI responses can be inaccurate or outdated; verify important details with reliable sources.</p>
              </details>
              <button type="button" className="link-button" onClick={onClose} aria-label="Close tutor">
                ✕
              </button>
            </div>
          </header>

          <div className="messages" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`bubble bubble-${m.role}`}>
                {m.role === "tutor" ? (
                  <>
                    <div className="markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.payload.narrative}</ReactMarkdown>
                      {m.payload.analogies.map((analogy, index) => <p key={index}><strong>Analogy:</strong> {analogy}</p>)}
                    </div>
                    {m.payload.visualization_nodes.length > 0 && (
                      <SocraticGraph topic={topic} payload={m.payload} />
                    )}
                    <div className="markdown">
                      {m.payload.socratic_questions.map((item, index) => <p key={index}><strong>Let&apos;s explore:</strong> {item}</p>)}
                    </div>
                  </>
                ) : (
                  m.text
                )}
              </div>
            ))}
            {loading && <div className="bubble bubble-tutor typing">Thinking…</div>}
            <div ref={endRef} />
          </div>

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
