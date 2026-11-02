import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getPool } from '../../../lib/db';

export const dynamic = 'force-dynamic';

type TopicRow = {
  track_slug: string;
  track_name: string;
  title: string;
  slug: string;
};

export async function GET() {
  try {
    const rows = await Sentry.startSpan(
      {
        name: 'SELECT topics',
        op: 'db.query',
        attributes: { 'db.system': 'postgresql', 'db.operation': 'SELECT' },
      },
      async () => {
        const result = await getPool().query(
          `SELECT tr.slug AS track_slug, tr.name AS track_name, tp.title, tp.slug
             FROM topics tp
             JOIN tracks tr ON tr.id = tp.track_id
            WHERE tp.is_custom = FALSE
            ORDER BY tr.name, tp.title`,
        );
        return result.rows as TopicRow[];
      },
    );

    const tracks = await Sentry.startSpan(
      { name: 'group topics by track', op: 'function' },
      async () => {
        const grouped = new Map<
          string,
          { slug: string; name: string; topics: { slug: string; title: string }[] }
        >();
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
      },
    );

    return NextResponse.json({ tracks });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Topics unavailable' }, { status: 503 });
  }
}
