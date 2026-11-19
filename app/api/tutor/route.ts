import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getPool } from '../../../lib/db';
import { createSupabaseServerClient } from '../../../lib/supabase-server';
import {
  askTutor,
  canAskCheckpoint,
  MAX_HISTORY_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_TOPIC_LENGTH,
  TutorLimitError,
} from '../../../lib/tutor';
import { tutorHistorySchema } from '../../../lib/types/socratic';
import { savedTopicNoteSchema } from '../../../lib/types/topic-note';
import { conceptsSchema, levelSchema } from '../../../lib/types/quiz';

export const dynamic = 'force-dynamic';

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
  const canRecall = mode === 'chat' && !alreadyRecalled && canAskCheckpoint(history.data);

  let stage: 'loading_topic' | 'generating_response' | 'saving_history' = 'loading_topic';
  try {
    const topicResult = await getPool().query<{
      title: string; previous_topics: string[]; saved_note: string | null;
      saved_depth: string | null; saved_next_step: string | null; saved_revision: number | null;
      level: string; quiz_concepts: unknown;
    }>(
      `SELECT t.title, COALESCE(p.level, 'Beginner') AS level, qp.concepts AS quiz_concepts,
       n.note AS saved_note, n.depth AS saved_depth,
       n.next_step AS saved_next_step, n.revision AS saved_revision, CASE WHEN $3::boolean THEN ARRAY(
        SELECT previous.title
        FROM topic_study_history h
        JOIN custom_topics previous ON previous.id = h.topic_id AND previous.user_id = h.user_id
        WHERE h.user_id = $1 AND h.topic_id <> t.id
        GROUP BY previous.title
        ORDER BY MAX(h.last_studied_at) DESC, previous.title
        LIMIT $4
      ) ELSE ARRAY[]::text[] END AS previous_topics
      FROM custom_topics t
      LEFT JOIN topic_notes n ON n.user_id = t.user_id AND n.topic_id = t.id
      LEFT JOIN topic_progress p ON p.user_id = t.user_id AND p.topic_id = t.id
      LEFT JOIN topic_quiz_plans qp ON qp.user_id = t.user_id AND qp.topic_id = t.id AND qp.level = COALESCE(p.level, 'Beginner')
      WHERE t.user_id = $1 AND t.id = $2`,
      [auth.user.id, topicId.data, canRecall, MAX_RECALL_TOPICS],
    );
    const topic = topicResult.rows[0];
    if (!topic) return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
    if ([topic.title, ...topic.previous_topics].some((title) => title.length > MAX_TOPIC_LENGTH)) {
      throw new Error('Stored topic exceeds the supported length.');
    }
    const savedNote = topic.saved_note == null ? null : savedTopicNoteSchema.parse({
      note: topic.saved_note, depth: topic.saved_depth, nextStep: topic.saved_next_step, revision: topic.saved_revision,
    });
    const resumeNote = savedNote && { note: savedNote.note, depth: savedNote.depth, nextStep: savedNote.nextStep };
    stage = 'generating_response';
    const { payload, recallTopic } = await askTutor({
      userId: auth.user.id, topic: topic.title, level: levelSchema.parse(topic.level), question, mode, history: history.data,
      previousTopics: topic.previous_topics, resumeNote,
      quizConcepts: topic.quiz_concepts == null ? undefined : conceptsSchema.parse(topic.quiz_concepts),
    });
    if (mode === 'chat') {
      stage = 'saving_history';
      const saved = await getPool().query(
        `INSERT INTO topic_study_history (user_id, topic_id, last_studied_at)
         SELECT user_id, id, NOW() FROM custom_topics WHERE user_id = $1 AND id = $2
         ON CONFLICT (user_id, topic_id) DO UPDATE SET last_studied_at = EXCLUDED.last_studied_at`,
        [auth.user.id, topicId.data],
      );
      if (!saved.rowCount) return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });

      if (recallTopic && canRecall && payload.socratic_questions.length === 0) {
        payload.socratic_questions = [
          `Recall checkpoint: What do you remember about ${recallTopic}, and how does it relate to your question?`,
        ];
      }
    }
    return NextResponse.json({ payload });
  } catch (error) {
    if (error instanceof TutorLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    const category = stage === 'generating_response' && (error instanceof z.ZodError || error instanceof SyntaxError)
      ? 'invalid_model_output'
      : 'request_failed';
    const status = stage === 'generating_response' && typeof error === 'object' && error !== null && 'status' in error
      && typeof error.status === 'number' && Number.isInteger(error.status) && error.status >= 100 && error.status <= 599
      ? error.status : undefined;
    console.error('[tutor] Request failed', { stage, category, ...(status ? { providerStatus: status } : {}) });
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Tutor unavailable' }, { status: 503 });
  }
}
