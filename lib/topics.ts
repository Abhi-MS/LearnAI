import { getPool } from './db';

export type TrackWithTopics = {
  slug: string;
  name: string;
  topics: { slug: string; title: string }[];
};

type TopicRow = {
  track_slug: string;
  track_name: string;
  title: string;
  slug: string;
};

export async function fetchCuratedTopicRows(trackSlug?: string) {
  const result = await getPool().query(
    `SELECT tr.slug AS track_slug, tr.name AS track_name, tp.title, tp.slug
       FROM topics tp
       JOIN tracks tr ON tr.id = tp.track_id
      WHERE tp.is_custom = FALSE
        AND ($1::text IS NULL OR tr.slug::text = $1)
      ORDER BY tr.name, tp.title`,
    [trackSlug ?? null],
  );

  return result.rows as TopicRow[];
}

export function groupTopicsByTrack(rows: TopicRow[]): TrackWithTopics[] {
  const grouped = new Map<string, TrackWithTopics>();

  for (const row of rows) {
    const track = grouped.get(row.track_slug) ?? {
      slug: row.track_slug,
      name: row.track_name,
      topics: [],
    };
    track.topics.push({ slug: row.slug, title: row.title });
    grouped.set(row.track_slug, track);
  }

  return Array.from(grouped.values());
}
