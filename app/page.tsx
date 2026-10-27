import React from "react";

export default function Home() {
  return (
    <main
      style={{ padding: "2rem", fontFamily: "sans-serif", lineHeight: 1.6 }}
    >
      <h1>LearnAI</h1>
      <p>
        A daily learning app for developers who use AI every day and want to
        rebuild the fundamentals that matter on the job.
      </p>
      <ul>
        <li>Track-based learning: frontend, backend, devops</li>
        <li>Custom and curated topic selection</li>
        <li>Level-aware AI tutoring</li>
        <li>Evidence-based quiz checkpoints</li>
      </ul>
    </main>
  );
}
