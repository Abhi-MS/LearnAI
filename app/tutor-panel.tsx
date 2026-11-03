"use client";

import React, { useState } from "react";

const LEVELS = ["Beginner", "Advanced", "Pro", "Job Ready"];
const MAX_QUESTION_LENGTH = 500;

export default function TutorPanel({
  topic,
  onClose,
}: {
  topic: string;
  onClose: () => void;
}) {
  const [level, setLevel] = useState(LEVELS[0]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim() || loading) return;

    setLoading(true);
    setError("");
    setAnswer("");

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, level, question }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          res.status === 429
            ? "Daily tutor limit reached. Try again tomorrow."
            : data.error ?? "Tutor unavailable right now.",
        );
      } else {
        setAnswer(data.answer);
      }
    } catch {
      setError("Tutor unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="tutor" aria-label={`Tutor for ${topic}`}>
      <div className="tutor-header">
        <h2>{topic}</h2>
        <button type="button" className="link-button" onClick={onClose}>
          Close
        </button>
      </div>

      <form onSubmit={ask} className="tutor-form">
        <div className="level-row" role="radiogroup" aria-label="Level">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={level === l}
              className={`chip-button${level === l ? " active" : ""}`}
              onClick={() => setLevel(l)}
            >
              {l}
            </button>
          ))}
        </div>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={MAX_QUESTION_LENGTH}
          rows={3}
          placeholder={`Ask anything about ${topic}…`}
        />
        <div className="tutor-actions">
          <span className="status">
            {question.length}/{MAX_QUESTION_LENGTH}
          </span>
          <button type="submit" className="primary" disabled={loading || !question.trim()}>
            {loading ? "Thinking…" : "Ask tutor"}
          </button>
        </div>
      </form>

      {error && <p className="status status-error">{error}</p>}
      {answer && <div className="answer">{answer}</div>}
    </section>
  );
}
