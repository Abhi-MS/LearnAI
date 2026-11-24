BEGIN;

CREATE TABLE guest_activity (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE guest_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE guest_activity FROM PUBLIC, anon, authenticated;

INSERT INTO guest_activity (user_id)
SELECT id FROM auth.users WHERE is_anonymous IS TRUE;

COMMIT;
