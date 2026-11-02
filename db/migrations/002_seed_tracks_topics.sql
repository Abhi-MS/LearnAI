INSERT INTO tracks (slug, name, description) VALUES
  ('frontend', 'Frontend', 'Browsers, rendering, and UI fundamentals'),
  ('backend', 'Backend', 'APIs, data, and server fundamentals'),
  ('devops', 'DevOps', 'Delivery, infrastructure, and operations fundamentals')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO topics (track_id, title, slug)
SELECT t.id, v.title, v.slug
FROM (VALUES
  ('frontend'::track_slug, 'HTTP caching', 'http-caching'),
  ('frontend', 'Browser rendering', 'browser-rendering'),
  ('backend', 'Database indexing', 'database-indexing'),
  ('backend', 'Idempotent APIs', 'idempotent-apis'),
  ('devops', 'Container networking', 'container-networking'),
  ('devops', 'CI pipelines', 'ci-pipelines')
) AS v(track, title, slug)
JOIN tracks t ON t.slug = v.track
ON CONFLICT (track_id, slug) DO NOTHING;
