BEGIN;

CREATE TABLE topic_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL,
  level TEXT NOT NULL DEFAULT 'Beginner' CHECK (level IN ('Beginner', 'Advanced', 'Pro', 'Job Ready')),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, topic_id),
  FOREIGN KEY (topic_id, user_id) REFERENCES custom_topics(id, user_id) ON DELETE CASCADE
);

CREATE TABLE topic_quiz_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('Beginner', 'Advanced', 'Pro', 'Job Ready')),
  concepts JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, topic_id, level),
  UNIQUE (id, user_id, topic_id),
  FOREIGN KEY (topic_id, user_id) REFERENCES custom_topics(id, user_id) ON DELETE CASCADE
);

CREATE TABLE topic_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('Beginner', 'Advanced', 'Pro', 'Job Ready')),
  questions JSONB NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (topic_id, user_id) REFERENCES custom_topics(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id, user_id, topic_id) REFERENCES topic_quiz_plans(id, user_id, topic_id) ON DELETE CASCADE
);

CREATE TABLE topic_quiz_results (
  attempt_id UUID PRIMARY KEY REFERENCES topic_quiz_attempts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('Beginner', 'Advanced', 'Pro', 'Job Ready')),
  correct_answers INTEGER NOT NULL CHECK (correct_answers BETWEEN 0 AND 5),
  total_questions INTEGER NOT NULL CHECK (total_questions = 5),
  passed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (topic_id, user_id) REFERENCES custom_topics(id, user_id) ON DELETE CASCADE
);

CREATE TABLE topic_concept_gaps (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL,
  concept TEXT NOT NULL CHECK (char_length(btrim(concept)) BETWEEN 1 AND 200),
  missed_count INTEGER NOT NULL DEFAULT 1 CHECK (missed_count > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, topic_id, concept),
  FOREIGN KEY (topic_id, user_id) REFERENCES custom_topics(id, user_id) ON DELETE CASCADE
);

ALTER TABLE topic_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_quiz_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_concept_gaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE topic_progress, topic_quiz_plans, topic_quiz_attempts,
  topic_quiz_results, topic_concept_gaps FROM PUBLIC, anon, authenticated;

COMMIT;
