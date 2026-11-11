import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getPool } from '../../../lib/db';
import { createSupabaseServerClient } from '../../../lib/supabase-server';
import {
  askTutor,
  MAX_HISTORY_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_TOPIC_LENGTH,
  TutorLimitError,
  type TutorLevel,
} from '../../../lib/tutor';
import { tutorHistorySchema } from '../../../lib/types/socratic';

export const dynamic = 'force-dynamic';

const LEVELS: TutorLevel[] = ['Beginner', 'Advanced', 'Pro', 'Job Ready'];
const MAX_RECALL_TOPICS = 50;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Please sign in to use the tutor.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const topicId = z.uuid().safeParse(body?.topicId);
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  const level: TutorLevel = LEVELS.includes(body?.level) ? body.level : 'Beginner';

  const mode = body?.mode === 'lesson' ? 'lesson' : 'chat';

  if (!topicId.success || (mode === 'chat' && !question)) {
    return NextResponse.json({ error: 'A valid topic and question are required.' }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: 'Input too long' }, { status: 400 });
  }
  const history = tutorHistorySchema.safeParse(body?.history ?? []);
  if (!history.success || (mode === 'lesson' && history.data.length > 0)) {
    return NextResponse.json({ error: 'Invalid conversation history.' }, { status: 400 });
  }
  if (JSON.stringify(history.data).length > MAX_HISTORY_LENGTH) {
    return NextResponse.json({ error: 'This conversation is too long. Please start a new topic session.' }, { status: 400 });
  }
  const alreadyRecalled = history.data.some((item) =>
    item.role === 'tutor' && item.payload.socratic_questions.some((question) => question.startsWith('Recall checkpoint: ')),
  );

  try {
    const topicResult = await getPool().query<{ title: string; previous_topics: string[] }>(
      `SELECT t.title, CASE WHEN $3::boolean THEN ARRAY(
        SELECT previous.title
        FROM topic_study_history h
        JOIN custom_topics previous ON previous.id = h.topic_id AND previous.user_id = h.user_id
        WHERE h.user_id = $1 AND h.topic_id <> t.id
        GROUP BY previous.title
        ORDER BY MAX(h.last_studied_at) DESC, previous.title
        LIMIT $4
      ) ELSE ARRAY[]::text[] END AS previous_topics
      FROM custom_topics t WHERE t.user_id = $1 AND t.id = $2`,
      [auth.user.id, topicId.data, mode === 'chat' && !alreadyRecalled, MAX_RECALL_TOPICS],
    );
    const topic = topicResult.rows[0];
    if (!topic) return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
    if ([topic.title, ...topic.previous_topics].some((title) => title.length > MAX_TOPIC_LENGTH)) {
      throw new Error('Stored topic exceeds the supported length.');
    }
    const { payload, recallTopic } = await askTutor({
      userId: auth.user.id, topic: topic.title, level, question, mode, history: history.data,
      previousTopics: topic.previous_topics,
    });
    if (mode === 'chat') {
      const saved = await getPool().query(
        `INSERT INTO topic_study_history (user_id, topic_id, last_studied_at)
         SELECT user_id, id, NOW() FROM custom_topics WHERE user_id = $1 AND id = $2
         ON CONFLICT (user_id, topic_id) DO UPDATE SET last_studied_at = EXCLUDED.last_studied_at`,
        [auth.user.id, topicId.data],
      );
      if (!saved.rowCount) return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });

      if (recallTopic) {
        payload.socratic_questions = [
          payload.socratic_questions[0],
          `Recall checkpoint: What do you remember about ${recallTopic}, and how does it relate to your question?`,
        ];
      }
    }
    return NextResponse.json({ payload });
  } catch (error) {
    if (error instanceof TutorLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Tutor unavailable' }, { status: 503 });
  }
}
