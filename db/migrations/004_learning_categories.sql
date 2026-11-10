CREATE TABLE learning_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_goal TEXT NOT NULL CHECK (char_length(btrim(learning_goal)) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE learning_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX learning_categories_user_name_idx
  ON learning_categories (user_id, lower(btrim(name)));

INSERT INTO learning_categories (user_id, name)
SELECT DISTINCT ON (user_id, lower(btrim(category))) user_id, btrim(category)
FROM custom_topics
ORDER BY user_id, lower(btrim(category)), created_at, id;

ALTER TABLE learning_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_categories ENABLE ROW LEVEL SECURITY;
