import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getPool } from '../../../../lib/db';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';
import { MAX_SUMMARY_HISTORY_LENGTH, summarizeTopic, TutorLimitError } from '../../../../lib/tutor';
import { tutorHistorySchema } from '../../../../lib/types/socratic';
import { savedTopicNoteSchema } from '../../../../lib/types/topic-note';

const requestSchema = z.object({
  topicId: z.uuid(),
  history: tutorHistorySchema,
}).strict();

type TopicRow = {
  title: string; note: string | null; depth: string | null; next_step: string | null; revision: number | null;
};

async function findTopic(userId: string, topicId: string) {
  const result = await getPool().query<TopicRow>(
    `SELECT t.title, n.note, n.depth, n.next_step, n.revision
     FROM custom_topics t
     LEFT JOIN topic_notes n ON n.user_id = t.user_id AND n.topic_id = t.id
     WHERE t.user_id = $1 AND t.id = $2`,
    [userId, topicId],
  );
  return result.rows[0];
}

function readNote(row: TopicRow) {
  return row.note === null ? null : savedTopicNoteSchema.parse({
    note: row.note, depth: row.depth, nextStep: row.next_step, revision: row.revision,
  });
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const topicId = z.uuid().safeParse(new URL(request.url).searchParams.get('topicId'));
  if (!topicId.success) return NextResponse.json({ error: 'Invalid topic.' }, { status: 400 });
  try {
    const row = await findTopic(user.id, topicId.data);
    if (!row) return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
    return NextResponse.json({ note: readNote(row) });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not load your topic note. Please try again.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || JSON.stringify(parsed.data.history).length > MAX_SUMMARY_HISTORY_LENGTH) {
    return NextResponse.json({ error: 'Invalid conversation history.' }, { status: 400 });
  }
  const { topicId, history } = parsed.data;
  const hasCompletedFollowUp = history.some((item, index) =>
    item.role === 'tutor' && history.slice(0, index).some((earlier) => earlier.role === 'user'),
  );
  if (!hasCompletedFollowUp) return NextResponse.json({ error: 'There is no completed conversation to summarize.' }, { status: 400 });

  try {
    const row = await findTopic(user.id, topicId);
    if (!row) return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
    const saved = readNote(row);
    const previousNote = saved && { note: saved.note, depth: saved.depth, nextStep: saved.nextStep };
    const summary = await summarizeTopic({ userId: user.id, topic: row.title, history, previousNote });
    const written = await getPool().query<{ revision: number }>(
      `INSERT INTO topic_notes (user_id, topic_id, note, depth, next_step)
       SELECT user_id, id, $3, $4, $5 FROM custom_topics WHERE user_id = $1 AND id = $2
       ON CONFLICT (user_id, topic_id) DO UPDATE SET
         note = EXCLUDED.note, depth = EXCLUDED.depth, next_step = EXCLUDED.next_step,
         revision = topic_notes.revision + 1, updated_at = NOW()
       WHERE topic_notes.revision = $6::integer
       RETURNING revision`,
      [user.id, topicId, summary.note, summary.depth, summary.nextStep, saved?.revision ?? null],
    );
    if (!written.rows.length) {
      return NextResponse.json({ error: 'The topic or its note changed. Please try saving again.' }, { status: 409 });
    }
    return NextResponse.json({ note: { ...summary, revision: written.rows[0].revision } });
  } catch (error) {
    if (error instanceof TutorLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not save your topic note. Please try again.' }, { status: 503 });
  }
}
