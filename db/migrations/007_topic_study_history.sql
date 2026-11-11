BEGIN;

ALTER TABLE custom_topics ADD CONSTRAINT custom_topics_id_user_unique UNIQUE (id, user_id);

CREATE TABLE topic_study_history (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL,
  last_studied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, topic_id),
  FOREIGN KEY (topic_id, user_id) REFERENCES custom_topics(id, user_id) ON DELETE CASCADE
);

CREATE INDEX topic_study_history_user_recent_idx
  ON topic_study_history (user_id, last_studied_at DESC);

ALTER TABLE topic_study_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE topic_study_history FROM PUBLIC, anon, authenticated;

COMMIT;
