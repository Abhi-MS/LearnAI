import React from "react";
import TopicsList from "./topics-list";

const features = [
  "Track-based learning",
  "Custom and curated topics",
  "Level-aware AI tutoring",
  "Evidence-based quizzes",
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <span className="badge">Daily learning for developers</span>
        <h1>LearnAI</h1>
        <p className="lead">
          A daily learning app for developers who use AI every day and want to
          rebuild the fundamentals that matter on the job.
        </p>
        <ul className="chips">
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Pick a track</h2>
        <TopicsList />
      </section>
    </main>
  );
}
