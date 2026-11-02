"use client";

import React, { useEffect, useState } from "react";

type Track = {
  slug: string;
  name: string;
  topics: { slug: string; title: string }[];
};

export default function TopicsList() {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
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
    <div className="track-grid">
      {tracks.map((track) => (
        <section key={track.slug} className={`card track-${track.slug}`}>
          <h3>{track.name}</h3>
          <ul className="topic-list">
            {track.topics.map((topic) => (
              <li key={topic.slug}>{topic.title}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
