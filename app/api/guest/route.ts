import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getPool } from '../../../lib/db';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!user.is_anonymous) return NextResponse.json({ ok: true });

  try {
    const result = await getPool().query(
      `INSERT INTO guest_activity (user_id, last_active_at)
       SELECT id, NOW() FROM auth.users WHERE id = $1 AND is_anonymous IS TRUE FOR UPDATE
       ON CONFLICT (user_id) DO UPDATE SET last_active_at = EXCLUDED.last_active_at
       RETURNING user_id`,
      [user.id],
    );
    if (!result.rowCount) return NextResponse.json({ error: 'Guest account is no longer available.' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not update guest activity. Please try again.' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (!user.is_anonymous) return NextResponse.json({ error: 'Only guest accounts can be deleted here.' }, { status: 403 });

  try {
    const result = await getPool().query(
      'DELETE FROM auth.users WHERE id = $1 AND is_anonymous IS TRUE RETURNING id',
      [user.id],
    );
    if (!result.rowCount) return NextResponse.json({ error: 'This account is no longer a guest. Please refresh.' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not delete guest progress. Please try again.' }, { status: 503 });
  }
}
