"use client";

import React, { useEffect, useState } from "react";
import TutorPanel from "./tutor-panel";
import { LEVELS, type Level } from "../lib/levels";

type Track = {
  slug: string;
  name: string;
  topics: { slug: string; title: string }[];
};

type SelectedTopic = { slug: string; title: string };

const STORAGE_KEY = "learnai:levels";

export default function TopicsList() {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<SelectedTopic | null>(null);
  // Levels are read from the browser for now; a grader will set them once quizzes exist
  const [levels, setLevels] = useState<Record<string, Level>>({});

  useEffect(() => {
    try {
      setLevels(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
    } catch {
      setLevels({});
    }

    fetch("/api/topics")
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
      )
      .then((data) => setTracks(data.tracks))
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return <p className="status status-error">Topics are unavailable right now.</p>;
  }

  if (!tracks) {
    return (
      <div className="track-grid" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card skeleton" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="track-grid">
        {tracks.map((track) => (
          <section key={track.slug} className={`card track-${track.slug}`}>
            <h3>{track.name}</h3>
            <ul className="topic-list">
              {track.topics.map((topic) => (
                <li key={topic.slug}>
                  <button
                    type="button"
                    className={`topic-button${selected?.slug === topic.slug ? " active" : ""}`}
                    onClick={() => setSelected(topic)}
                  >
                    <span>{topic.title}</span>
                    <span className="level-chip">{levels[topic.slug] ?? LEVELS[0]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {!selected && <p className="status">Select a topic to start a tutoring session.</p>}
      <TutorPanel
        key={selected?.slug ?? "closed"}
        topic={selected?.title ?? null}
        level={selected ? levels[selected.slug] ?? LEVELS[0] : LEVELS[0]}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
