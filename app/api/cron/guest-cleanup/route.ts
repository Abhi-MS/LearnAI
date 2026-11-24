import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getPool } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const result = await getPool().query(
      `WITH expired AS (
         SELECT u.id FROM auth.users u
         LEFT JOIN guest_activity a ON a.user_id = u.id
         WHERE u.is_anonymous IS TRUE
           AND COALESCE(a.last_active_at, u.created_at) < NOW() - INTERVAL '30 days'
         ORDER BY COALESCE(a.last_active_at, u.created_at), u.id
         LIMIT 1000
         FOR UPDATE OF u SKIP LOCKED
       )
       DELETE FROM auth.users u USING expired
       WHERE u.id = expired.id AND u.is_anonymous IS TRUE
       RETURNING u.id`,
    );
    return NextResponse.json({ deleted: result.rowCount });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Guest cleanup failed.' }, { status: 503 });
  }
}
