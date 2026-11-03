import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { checkDatabaseHealth } from '../../../../lib/db';

export async function GET() {
  try {
    const ok = await checkDatabaseHealth();

    return NextResponse.json(
      { ok, database: 'supabase' },
      { status: ok ? 200 : 503 },
    );
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ ok: false, database: 'supabase' }, { status: 503 });
  }
}
