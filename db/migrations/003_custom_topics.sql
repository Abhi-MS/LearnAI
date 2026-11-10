CREATE TABLE custom_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (char_length(btrim(category)) BETWEEN 1 AND 80),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX custom_topics_user_category_title_idx
  ON custom_topics (user_id, lower(btrim(category)), lower(btrim(title)));

ALTER TABLE custom_topics ENABLE ROW LEVEL SECURITY;
