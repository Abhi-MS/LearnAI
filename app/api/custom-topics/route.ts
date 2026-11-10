import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getPool } from '../../../lib/db';
import { createSupabaseServerClient } from '../../../lib/supabase-server';
import { MAX_CATEGORY_LENGTH, MAX_TOPIC_LENGTH } from '../../../lib/topic-limits';

export const dynamic = 'force-dynamic';

const customTopicSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TOPIC_LENGTH),
  category: z.string().trim().min(1).max(MAX_CATEGORY_LENGTH),
});

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to view custom topics.' }, { status: 401 });
    }

    const result = await getPool().query(
      'SELECT id, category, title FROM custom_topics WHERE user_id = $1 ORDER BY created_at, id',
      [user.id],
    );
    return NextResponse.json({ topics: result.rows });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Custom topics are unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to add a topic.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = customTopicSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Enter a topic (up to ${MAX_TOPIC_LENGTH} characters) and category (up to ${MAX_CATEGORY_LENGTH} characters).` },
        { status: 400 },
      );
    }

    const result = await getPool().query(
      `INSERT INTO custom_topics (user_id, category, title)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, lower(btrim(category)), lower(btrim(title))) DO NOTHING
       RETURNING id, category, title`,
      [user.id, parsed.data.category, parsed.data.title],
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'You already added this topic to that category.' }, { status: 409 });
    }
    return NextResponse.json({ topic: result.rows[0] }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not add the topic. Please try again.' }, { status: 503 });
  }
}
