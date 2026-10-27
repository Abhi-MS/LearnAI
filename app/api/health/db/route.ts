import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '../../../../lib/db';

export async function GET() {
  try {
    const ok = await checkDatabaseHealth();

    return NextResponse.json(
      { ok, database: 'supabase' },
      { status: ok ? 200 : 503 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        database: 'supabase',
        error: error instanceof Error ? error.message : 'Database unavailable',
      },
      { status: 503 },
    );
  }
}
