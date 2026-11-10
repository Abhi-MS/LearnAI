"use client";

import React, { useEffect, useState } from "react";
import TutorPanel from "./tutor-panel";
import { LEVELS, type Level } from "../lib/levels";
import { MAX_CATEGORY_LENGTH, MAX_TOPIC_LENGTH } from "../lib/topic-limits";

type Track = {
  slug: string;
  name: string;
  topics: { slug: string; title: string }[];
};

type SelectedTopic = { slug: string; title: string };
type CustomTopic = { id: string; category: string; title: string };

const STORAGE_KEY = "learnai:levels";

export default function TopicsList() {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<SelectedTopic | null>(null);
  const [customTopics, setCustomTopics] = useState<CustomTopic[]>([]);
  const [customLoading, setCustomLoading] = useState(true);
  const [customFailed, setCustomFailed] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
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

    fetch("/api/custom-topics")
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
      )
      .then((data) => setCustomTopics(data.topics))
      .catch(() => setCustomFailed(true))
      .finally(() => setCustomLoading(false));
  }, []);

  async function addTopic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || customLoading || customFailed || !tracks) return;
    const chosenCategory = category === "new" || (!category && visibleTracks.length === 0)
      ? newCategory
      : category ? category.slice("existing:".length) : visibleTracks[0].name;
    setFormError("");
    setSuccess("");
    setSaving(true);
    try {
      const response = await fetch("/api/custom-topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, category: chosenCategory }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add the topic.");
      setCustomTopics((topics) => [...topics, data.topic]);
      setTitle("");
      setNewCategory("");
      const existingCategory = visibleTracks.find(
        (track) => track.name.toLowerCase() === data.topic.category.toLowerCase(),
      );
      setCategory(`existing:${existingCategory?.name ?? data.topic.category}`);
      setSuccess(`Added ${data.topic.title} to ${existingCategory?.name ?? data.topic.category}.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not add the topic.");
    } finally {
      setSaving(false);
    }
  }

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

  const visibleTracks = tracks.map((track) => ({ ...track, topics: [...track.topics] }));
  for (const topic of customTopics) {
    let track = visibleTracks.find(
      (item) => item.name.toLowerCase() === topic.category.toLowerCase(),
    );
    if (!track) {
      track = { slug: `custom-${topic.id}`, name: topic.category, topics: [] };
      visibleTracks.push(track);
    }
    track.topics.push({ slug: `custom-${topic.id}`, title: topic.title });
  }

  return (
    <>
      <div className="track-grid">
        <section className="card custom-topic-card" aria-labelledby="custom-topic-heading">
          <h3 id="custom-topic-heading">Custom</h3>
          <p className="custom-topic-description">Add a topic just for you.</p>
          <form className="custom-topic-form" onSubmit={addTopic}>
            <label htmlFor="custom-topic-title">Topic</label>
            <input id="custom-topic-title" placeholder="e.g. Event sourcing" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={MAX_TOPIC_LENGTH} disabled={saving || customLoading || customFailed} required />
            <label htmlFor="custom-topic-category">Category</label>
            <select id="custom-topic-category" value={category || (visibleTracks[0] ? `existing:${visibleTracks[0].name}` : "new")} onChange={(event) => setCategory(event.target.value)} disabled={saving || customLoading || customFailed}>
              {visibleTracks.map((track) => <option key={track.slug} value={`existing:${track.name}`}>{track.name}</option>)}
              <option value="new">Add a new category</option>
            </select>
            {(category === "new" || (!category && visibleTracks.length === 0)) && (
              <>
                <label htmlFor="custom-topic-new-category">New category</label>
                <input id="custom-topic-new-category" placeholder="e.g. Architecture" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} maxLength={MAX_CATEGORY_LENGTH} disabled={saving || customLoading || customFailed} required />
              </>
            )}
            {customLoading && <p className="status" role="status">Loading your topics...</p>}
            {customFailed && <p className="status status-error" role="alert">Your custom topics could not be loaded. Refresh the page to try again.</p>}
            {formError && <p className="status status-error" role="alert">{formError}</p>}
            {success && <p className="custom-topic-success" role="status">{success}</p>}
            <button type="submit" className="primary" disabled={saving || customLoading || customFailed}>{saving ? "Adding..." : "Add topic"}</button>
          </form>
        </section>
        {visibleTracks.map((track) => (
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
