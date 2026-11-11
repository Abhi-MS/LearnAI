"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Level } from "../lib/levels";
import { socraticPayloadSchema, type SocraticPayload, type TutorHistory } from "../lib/types/socratic";
import { savedTopicNoteSchema, type SavedTopicNote } from "../lib/types/topic-note";
import { fetchTopicNote } from "../lib/topic-note-client";
import SocraticGraph from "./socratic-graph";

const MAX_QUESTION_LENGTH = 500;

type Message =
  | { role: "tutor"; payload: SocraticPayload }
  | { role: "user" | "error"; text: string };

type TutorRequest = { topicId: string; level: Level; mode: "lesson" | "chat"; question?: string; history: TutorHistory };
export type TutorPanelHandle = { prepareToLeave: () => Promise<boolean> };

function hasCompletedFollowUp(history: TutorHistory) {
  return history.some((item, index) => item.role === "tutor" && history.slice(0, index).some((earlier) => earlier.role === "user"));
}

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

const TutorPanel = forwardRef<TutorPanelHandle, {
  topicId: string | null;
  topic: string | null;
  level: Level;
  onClose: () => void;
  onRetryLeave?: () => void;
  onDiscardLeave?: () => void;
  onNoteSaved?: (topicId: string) => void;
}>(function TutorPanel({
  topicId,
  topic,
  level,
  onClose,
  onRetryLeave,
  onDiscardLeave,
  onNoteSaved,
}, ref) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<TutorHistory>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedNote, setSavedNote] = useState<SavedTopicNote | null>(null);
  const [noteError, setNoteError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDetailsElement>(null);
  const savingRef = useRef(false);
  const savedHistoryRef = useRef("");
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

  async function loadNote(id: string) {
    setNoteError("");
    try {
      const note = await fetchTopicNote(id);
      setSavedNote((current) => current && (!note || current.revision > note.revision) ? current : note);
      if (note) onNoteSaved?.(id);
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Could not load your topic note.");
    }
  }

  useImperativeHandle(ref, () => ({
    async prepareToLeave() {
      if (loading || savingRef.current) {
        setSaveError("Please wait for the current request to finish.");
        return false;
      }
      if (!topicId || !hasCompletedFollowUp(history) || savedHistoryRef.current === JSON.stringify(history)) return true;
      savingRef.current = true;
      setSavingNote(true);
      setSaveError("");
      try {
        const body = JSON.stringify({ topicId, history });
        const response = await fetch("/api/tutor/summary", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: new Blob([body]).size <= 60000,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not save your topic note.");
        const note = savedTopicNoteSchema.safeParse(data?.note);
        if (!note.success) throw new Error("The saved topic note could not be displayed. Please try again.");
        setSavedNote(note.data);
        onNoteSaved?.(topicId);
        savedHistoryRef.current = JSON.stringify(history);
        return true;
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Could not save your topic note.");
        return false;
      } finally {
        savingRef.current = false;
        setSavingNote(false);
      }
    },
  }), [topicId, history, loading, onNoteSaved]);

  useEffect(() => {
    const saveOnPageExit = () => {
      if (!topicId || savingRef.current || !hasCompletedFollowUp(history) || savedHistoryRef.current === JSON.stringify(history)) return;
      const body = JSON.stringify({ topicId, history });
      if (new Blob([body]).size > 60000) {
        console.error("Could not save the topic note during page exit: conversation is too large.");
        return;
      }
      fetch("/api/tutor/summary", {
        method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true,
      }).then((response) => {
        if (!response.ok) console.error("Could not save the topic note during page exit.");
      }).catch(() => console.error("Could not save the topic note during page exit."));
    };
    window.addEventListener("pagehide", saveOnPageExit);
    return () => window.removeEventListener("pagehide", saveOnPageExit);
  }, [topicId, history]);

  const startedRef = useRef(false);

  // The panel is re-mounted per topic, so this loads one lesson overview per open
  useEffect(() => {
    // Strict Mode runs effects twice in dev; the ref keeps it to one request
    if (startedRef.current) return;
    startedRef.current = true;
    if (topic && topicId) {
      void loadNote(topicId);
      void load({ topicId, level, mode: "lesson", history: [] });
    }
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
    if (!text || loading || savingNote || !topic || !topicId) return;
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
                <p className="privacy-notice tutor-notice-content">Your topic and active conversation are sent to Google Gemini. A generated topic note is saved and sent back to Gemini when you return. Names of recently studied topics may also be sent to check their relevance; diagram answers and diagram details are sent for assessment. Don&apos;t include sensitive or confidential information. AI responses can be inaccurate or outdated; verify important details with reliable sources.</p>
              </details>
              <button type="button" className="link-button" onClick={onClose} aria-label="Close tutor">
                ✕
              </button>
            </div>
          </header>

          {savedNote && (
            <details className="topic-notes">
              <summary>Topic notes</summary>
              <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{savedNote.note}</ReactMarkdown></div>
              <p><strong>Material discussed:</strong> {savedNote.depth}</p>
              <p><strong>Next step:</strong> {savedNote.nextStep}</p>
            </details>
          )}
          {noteError && <div className="topic-note-error" role="alert">{noteError} <button type="button" className="chip-button" onClick={() => topicId && loadNote(topicId)}>Retry loading notes</button></div>}
          {savingNote && <p className="status" role="status">Saving topic note…</p>}
          {saveError && (
            <div className="topic-note-error" role="alert">
              <p>{saveError}</p>
              {onRetryLeave && <button type="button" className="chip-button" onClick={onRetryLeave}>Retry saving and leave</button>}
              {onDiscardLeave && <button type="button" className="chip-button" onClick={onDiscardLeave}>Leave without saving</button>}
            </div>
          )}
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
              disabled={savingNote}
              placeholder={`Ask about ${topic}…`}
            />
            <button type="submit" className="primary" disabled={loading || savingNote || !question.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </aside>
  );
});

export default TutorPanel;
