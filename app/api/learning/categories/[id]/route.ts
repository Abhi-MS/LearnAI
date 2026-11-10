import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { withUserLearningTransaction } from '../../../../../lib/learning';
import { createSupabaseServerClient } from '../../../../../lib/supabase-server';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid category.' }, { status: 400 });

    const deleted = await withUserLearningTransaction(user.id, async (client) => {
      const category = await client.query(
        'SELECT id FROM learning_categories WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [id, user.id],
      );
      if (!category.rows.length) return false;
      await client.query(
        'DELETE FROM custom_topics WHERE user_id = $1 AND category_id = $2',
        [user.id, id],
      );
      await client.query('DELETE FROM learning_categories WHERE id = $1 AND user_id = $2', [id, user.id]);
      return true;
    });
    if (!deleted) return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not delete the category. Please try again.' }, { status: 503 });
  }
}
