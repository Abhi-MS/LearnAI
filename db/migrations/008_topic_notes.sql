BEGIN;

CREATE TABLE topic_notes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL,
  note TEXT NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 3000),
  depth TEXT NOT NULL CHECK (depth IN ('unclear', 'introductory', 'developing', 'detailed')),
  next_step TEXT NOT NULL CHECK (char_length(btrim(next_step)) BETWEEN 1 AND 500),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, topic_id),
  FOREIGN KEY (topic_id, user_id) REFERENCES custom_topics(id, user_id) ON DELETE CASCADE
);

ALTER TABLE topic_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE topic_notes FROM PUBLIC, anon, authenticated;

COMMIT;
