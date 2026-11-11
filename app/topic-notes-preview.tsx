"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchTopicNote } from "../lib/topic-note-client";
import type { SavedTopicNote } from "../lib/types/topic-note";

type NoteState =
  | { status: "loading" }
  | { status: "loaded"; note: SavedTopicNote | null }
  | { status: "error"; message: string };

export default function TopicNotesPreview({
  topicId, title, open, onToggle, onClose,
}: {
  topicId: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<NoteState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchTopicNote(topicId, controller.signal).then((note) => {
      if (!controller.signal.aborted) setState({ status: "loaded", note });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not load your topic note.",
      });
    });
    return () => controller.abort();
  }, [open, topicId, attempt]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  return (
    <div className="topic-notes-preview" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="topic-notes-icon"
        aria-label={`Notes for ${title}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={`Notes for ${title}`}
        onClick={onToggle}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 4h14v12H9l-4 4V4z" />
          <path d="M8 8h8M8 12h6" />
        </svg>
      </button>
      {open && (
        <div id={id} role="dialog" aria-label={`Notes for ${title}`} className="topic-notes-popup">
          <div className="topic-notes-popup-header">
            <strong>Topic notes</strong>
            <button type="button" className="link-button" aria-label="Close notes" onClick={() => { onClose(); triggerRef.current?.focus(); }}>×</button>
          </div>
          {state.status === "loading" && <p role="status">Loading notes…</p>}
          {state.status === "error" && (
            <div role="alert">
              <p>{state.message}</p>
              <button type="button" className="chip-button" onClick={() => setAttempt((value) => value + 1)}>Retry</button>
            </div>
          )}
          {state.status === "loaded" && (state.note ? (
            <>
              <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{state.note.note}</ReactMarkdown></div>
              <p><strong>Material discussed:</strong> {state.note.depth}</p>
              <p><strong>Next step:</strong> {state.note.nextStep}</p>
            </>
          ) : <p>No saved notes yet.</p>)}
        </div>
      )}
    </div>
  );
}
