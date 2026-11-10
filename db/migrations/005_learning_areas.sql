BEGIN;

CREATE TABLE learning_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX learning_areas_user_name_idx
  ON learning_areas (user_id, lower(btrim(name)));

INSERT INTO learning_areas (user_id, name, created_at)
SELECT user_id, learning_goal, created_at FROM learning_profiles;

ALTER TABLE learning_profiles ADD COLUMN active_area_id UUID;
UPDATE learning_profiles p SET active_area_id = a.id
FROM learning_areas a WHERE a.user_id = p.user_id;
ALTER TABLE learning_profiles
  ADD CONSTRAINT learning_profiles_active_area_fk
  FOREIGN KEY (active_area_id, user_id) REFERENCES learning_areas(id, user_id);

ALTER TABLE learning_categories ADD COLUMN area_id UUID;
UPDATE learning_categories c SET area_id = a.id
FROM learning_areas a WHERE a.user_id = c.user_id;
ALTER TABLE learning_categories ADD CONSTRAINT learning_categories_area_fk
  FOREIGN KEY (area_id, user_id) REFERENCES learning_areas(id, user_id);
ALTER TABLE learning_categories ADD CONSTRAINT learning_categories_id_user_unique UNIQUE (id, user_id);
DROP INDEX learning_categories_user_name_idx;
CREATE UNIQUE INDEX learning_categories_area_name_idx
  ON learning_categories (area_id, lower(btrim(name))) WHERE area_id IS NOT NULL;
CREATE UNIQUE INDEX learning_categories_unassigned_name_idx
  ON learning_categories (user_id, lower(btrim(name))) WHERE area_id IS NULL;

ALTER TABLE custom_topics ADD COLUMN category_id UUID;
UPDATE custom_topics t SET category_id = c.id
FROM learning_categories c
WHERE c.user_id = t.user_id AND lower(btrim(c.name)) = lower(btrim(t.category));
ALTER TABLE custom_topics ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE custom_topics ADD CONSTRAINT custom_topics_category_fk
  FOREIGN KEY (category_id, user_id) REFERENCES learning_categories(id, user_id);
DROP INDEX custom_topics_user_category_title_idx;
CREATE UNIQUE INDEX custom_topics_category_title_idx
  ON custom_topics (category_id, lower(btrim(title)));

ALTER TABLE learning_areas ENABLE ROW LEVEL SECURITY;
COMMIT;
