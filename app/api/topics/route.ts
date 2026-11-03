import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { fetchCuratedTopicRows, groupTopicsByTrack } from '../../../lib/topics';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await Sentry.startSpan(
      {
        name: 'SELECT topics',
        op: 'db.query',
        attributes: { 'db.system': 'postgresql', 'db.operation': 'SELECT' },
      },
      () => fetchCuratedTopicRows(),
    );

    const tracks = await Sentry.startSpan(
      { name: 'group topics by track', op: 'function' },
      async () => groupTopicsByTrack(rows),
    );

    return NextResponse.json({ tracks });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Topics unavailable' }, { status: 503 });
  }
}
