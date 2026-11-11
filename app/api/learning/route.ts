import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getPool } from '../../../lib/db';
import { ensureCategory, withUserLearningTransaction } from '../../../lib/learning';
import { generateLearningCategories } from '../../../lib/learning-generation';
import { MAX_LEARNING_GOAL_LENGTH } from '../../../lib/topic-limits';
import { createDailyLimiter, createKeyedDailyLimiter } from '../../../lib/limiter';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

export const dynamic = 'force-dynamic';

const consumeGlobal = createDailyLimiter(100);
const consumeUser = createKeyedDailyLimiter(5);
const goalSchema = z.string().trim().min(1).max(MAX_LEARNING_GOAL_LENGTH);

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

    const result = await getPool().query(
      `SELECT (SELECT active_area_id FROM learning_profiles WHERE user_id = $1) AS "activeAreaId",
        COALESCE((
          SELECT json_agg(json_build_object('id', a.id, 'name', a.name, 'categories', COALESCE((
            SELECT json_agg(json_build_object(
              'id', c.id, 'name', c.name,
              'topics', COALESCE((
                SELECT json_agg(json_build_object(
                  'id', t.id, 'title', t.title,
                  'hasNote', EXISTS (SELECT 1 FROM topic_notes n WHERE n.user_id = t.user_id AND n.topic_id = t.id)
                ) ORDER BY t.created_at, t.id)
                FROM custom_topics t WHERE t.user_id = c.user_id AND t.category_id = c.id
              ), '[]'::json)
            ) ORDER BY c.created_at, c.id)
            FROM learning_categories c WHERE c.user_id = a.user_id AND c.area_id = a.id
          ), '[]'::json)) ORDER BY a.created_at, a.id)
          FROM learning_areas a WHERE a.user_id = $1
        ), '[]'::json) AS areas`,
      [user.id],
    );
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Your learning plan is unavailable. Please try again.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const goal = goalSchema.safeParse(body?.goal);
    if (!goal.success) {
      return NextResponse.json({ error: `Enter a learning goal of up to ${MAX_LEARNING_GOAL_LENGTH} characters.` }, { status: 400 });
    }
    const existing = await getPool().query('SELECT 1 FROM learning_areas WHERE user_id = $1 AND lower(btrim(name)) = lower(btrim($2))', [user.id, goal.data]);
    if (existing.rows.length) return NextResponse.json({ error: 'You already have an exploration with that name.' }, { status: 409 });
    if (!consumeUser(user.id) || !consumeGlobal()) {
      return NextResponse.json({ error: 'Plan generation limit reached. Please try again tomorrow.' }, { status: 429 });
    }

    const categories = await generateLearningCategories(goal.data);
    const created = await withUserLearningTransaction(user.id, async (client) => {
      const area = await client.query<{ id: string }>(
        `INSERT INTO learning_areas (user_id, name) VALUES ($1, $2)
         ON CONFLICT (user_id, lower(btrim(name))) DO NOTHING RETURNING id`,
        [user.id, goal.data],
      );
      if (!area.rows.length) return false;
      const areaId = area.rows[0].id;
      await client.query(
        `INSERT INTO learning_profiles (user_id, learning_goal, active_area_id) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET active_area_id = EXCLUDED.active_area_id`,
        [user.id, goal.data, areaId],
      );
      await client.query('UPDATE learning_categories SET area_id = $1 WHERE user_id = $2 AND area_id IS NULL', [areaId, user.id]);
      for (const category of categories) {
        const saved = await ensureCategory(client, user.id, areaId, category.name);
        for (const topic of category.topics) {
          await client.query(
            `INSERT INTO custom_topics (user_id, category_id, category, title) VALUES ($1, $2, $3, $4)
             ON CONFLICT (category_id, lower(btrim(title))) DO NOTHING`,
            [user.id, saved.id, saved.name, topic],
          );
        }
      }
      return true;
    });
    if (!created) return NextResponse.json({ error: 'You already have an exploration with that name.' }, { status: 409 });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not create your learning plan. Please try again.' }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
      const body = await request.json().catch(() => null);
      const areaId = z.uuid().safeParse(body?.areaId);
      if (!areaId.success) return NextResponse.json({ error: 'Invalid learning area.' }, { status: 400 });
      const result = await getPool().query(
        `UPDATE learning_profiles SET active_area_id = $1
         WHERE user_id = $2 AND EXISTS (SELECT 1 FROM learning_areas WHERE id = $1 AND user_id = $2)
         RETURNING active_area_id`,
        [areaId.data, user.id],
      );
      if (!result.rows.length) return NextResponse.json({ error: 'Learning area not found.' }, { status: 404 });
      return NextResponse.json({ ok: true });
    } catch (error) {
      Sentry.captureException(error);
      return NextResponse.json({ error: 'Could not switch learning areas. Please try again.' }, { status: 503 });
  }
}
