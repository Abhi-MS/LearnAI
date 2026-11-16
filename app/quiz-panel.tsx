"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import type { Level } from "../lib/levels";
import { conceptsSchema, levelSchema, quizResultSchema, type QuizResult } from "../lib/types/quiz";
import type { SocraticPayload } from "../lib/types/socratic";

const planSchema = z.object({ id: z.uuid(), level: levelSchema, concepts: conceptsSchema });
const questionSchema = z.object({
  type: z.enum(["multiple_choice", "short_answer"]),
  prompt: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(250)).max(4),
});
const attemptSchema = z.object({ attemptId: z.uuid(), questions: z.array(questionSchema).length(5) });
type Plan = z.infer<typeof planSchema>;
type Attempt = z.infer<typeof attemptSchema>;

async function quizRequest(body: object) {
  const response = await fetch("/api/quiz", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Quiz unavailable. Please try again.");
  return data;
}

export default function QuizPanel({ topicId, level, completed, coverage, onProgress }: {
  topicId: string;
  level: Level;
  completed: boolean;
  coverage?: SocraticPayload["quiz_coverage"];
  onProgress: (level: Level, completed: boolean) => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<string[]>(Array(5).fill(""));
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    let active = true;
    setPlan(null);
    setAttempt(null);
    setAnswers(Array(5).fill(""));
    setDismissed(false);
    setError("");
    quizRequest({ action: "plan", topicId }).then((data) => {
      const parsed = planSchema.parse(data.plan);
      const currentCompleted = z.boolean().parse(data.completed);
      if (active) {
        setPlan(parsed);
        if (parsed.level !== level || currentCompleted !== completed) onProgressRef.current(parsed.level, currentCompleted);
      }
    }).catch((failure) => {
      if (active) setError(failure instanceof Error ? failure.message : "Could not prepare the quiz plan.");
    });
    return () => { active = false; };
  }, [topicId, level, completed, retry]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      const data = await quizRequest({ action: "start", topicId });
      setAttempt(attemptSchema.parse(data));
      setAnswers(Array(5).fill(""));
      setResult(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not start the quiz.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!attempt || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await quizRequest({ action: "submit", attemptId: attempt.attemptId, answers });
      const parsed = quizResultSchema.parse(data.result);
      setResult(parsed);
      setAttempt(null);
      onProgress(parsed.level, parsed.completed);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not assess the quiz.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="quiz-panel" aria-label="Topic quiz">
      <div className="quiz-panel-header">
        <strong>Topic quiz</strong>
        <button type="button" className="link-button" aria-label={collapsed ? "Open quiz" : "Collapse quiz"}
          aria-expanded={!collapsed} aria-controls={contentId} onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? "Open quiz" : "×"}
        </button>
      </div>
      {collapsed && error && <p className="status status-error" role="alert">{error}</p>}
      {collapsed && !error && result && <p className="status" role="status">Quiz result ready.</p>}
      <div id={contentId} hidden={collapsed}>
      {error && <p className="status status-error" role="alert">{error}</p>}
      {!plan && !error && <p className="status">Preparing a quiz plan…</p>}
      {!plan && error && <button type="button" className="chip-button" onClick={() => setRetry((value) => value + 1)}>Retry quiz plan</button>}
      {plan && !attempt && (
        <>
          <details>
            <summary>Quiz plan · {plan.level}</summary>
            <ul>{plan.concepts.map((concept, index) => <li key={concept}>{concept}{coverage?.covered.includes(index) ? " — discussed" : ""}</li>)}</ul>
            {coverage && coverage.additional.length > 0 && <p>Also discussed: {coverage.additional.join(", ")}</p>}
            <p>Discussion is not evidence of mastery. A quiz is always optional.</p>
          </details>
          {coverage?.ready && !dismissed && !result && <p role="status">You may be ready for a quiz. Continue chatting or try it when you like. <button type="button" className="link-button" onClick={() => setDismissed(true)}>Not now</button></p>}
          <button type="button" className="chip-button" disabled={busy} onClick={start}>{busy ? "Preparing quiz…" : "Take quiz"}</button>
        </>
      )}
      {attempt && (
        <form onSubmit={submit}>
          <p>Answer all five questions. A score of 80% or higher passes after a second check.</p>
          {attempt.questions.map((question, index) => (
            <fieldset key={index} disabled={busy}>
              <legend>{index + 1}. {question.prompt}</legend>
              {question.type === "multiple_choice" ? question.options.map((option) => (
                <label key={option}><input type="radio" name={`quiz-${index}`} value={option} required checked={answers[index] === option}
                  onChange={() => setAnswers((current) => current.map((answer, i) => i === index ? option : answer))} /> {option}</label>
              )) : <textarea aria-label={`Answer question ${index + 1}`} required maxLength={500} value={answers[index]}
                onChange={(event) => setAnswers((current) => current.map((answer, i) => i === index ? event.target.value : answer))} />}
            </fieldset>
          ))}
          <button type="submit" className="primary" disabled={busy || answers.some((answer) => !answer.trim())}>{busy ? "Checking answers…" : "Submit quiz"}</button>
          <button type="button" className="chip-button" disabled={busy} onClick={() => setAttempt(null)}>Continue chatting</button>
        </form>
      )}
      {result && (
        <div role="status">
          <p>{result.correct} / {result.total} correct — {result.passed ? "Passed" : "Not passed"}. Current level: {result.level}{result.completed ? " · Topic complete" : ""}.</p>
          <ol>{result.grades.map((grade) => <li key={grade.questionIndex}>{grade.correct ? "Correct" : "Review"}: {grade.feedback}</li>)}</ol>
        </div>
      )}
      </div>
    </section>
  );
}
