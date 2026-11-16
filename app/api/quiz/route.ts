import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { getPool } from '../../../lib/db';
import { createSupabaseServerClient } from '../../../lib/supabase-server';
import { generateQuiz, planQuiz, QuizValidationError, validateQuiz } from '../../../lib/quiz';
import { getProgress, getQuizAttempt, getQuizPlan, recordQuizResult, saveQuizPlan } from '../../../lib/quiz-store';
import { quizAnswersSchema } from '../../../lib/types/quiz';
import { TutorLimitError } from '../../../lib/tutor';

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('plan'), topicId: z.uuid() }).strict(),
  z.object({ action: z.literal('start'), topicId: z.uuid() }).strict(),
  z.object({ action: z.literal('submit'), attemptId: z.uuid(), answers: quizAnswersSchema }).strict(),
]);

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Invalid quiz request.' }, { status: 400 });
  try {
    if (input.data.action === 'submit') {
      const { attemptId, answers } = input.data;
      const attempt = await getQuizAttempt(user.id, attemptId);
      if (!attempt) return NextResponse.json({ error: 'Quiz not found.' }, { status: 404 });
      if (attempt.result) return NextResponse.json({ result: attempt.result });
      if (attempt.questions.some((question, index) => question.type === 'multiple_choice' && !question.options.includes(answers[index]))) {
        return NextResponse.json({ error: 'Select one of the available answers for each multiple-choice question.' }, { status: 400 });
      }
      const progress = await getProgress(user.id, attempt.topicId);
      if (!progress || progress.level !== attempt.level) {
        return NextResponse.json({ error: 'Your topic level changed. Please start a new quiz.' }, { status: 409 });
      }
      const grades = await validateQuiz(user.id, attempt.title, attempt.concepts, attempt.questions, answers);
      const result = await recordQuizResult(user.id, attemptId, attempt.topicId, attempt.level, attempt.concepts, grades,
        attempt.questions.map((question) => question.conceptIndex));
      if (!result) return NextResponse.json({ error: 'Your topic or level changed. Please start a new quiz.' }, { status: 409 });
      return NextResponse.json({ result });
    }

    const progress = await getProgress(user.id, input.data.topicId);
    if (!progress) return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
    let plan = await getQuizPlan(user.id, input.data.topicId, progress.level);
    if (input.data.action === 'plan') {
      if (!plan) {
        const concepts = await planQuiz(user.id, progress.title, progress.level);
        plan = await saveQuizPlan(user.id, input.data.topicId, progress.level, concepts);
      }
      if (!plan) return NextResponse.json({ error: 'Your topic or level changed. Please try again.' }, { status: 409 });
      return NextResponse.json({ plan: { ...plan, level: progress.level }, completed: progress.completed });
    }
    if (!plan) return NextResponse.json({ error: 'Prepare a quiz plan before starting.' }, { status: 409 });
    const questions = await generateQuiz(user.id, progress.title, progress.level, plan.concepts);
    const saved = await getPool().query<{ id: string }>(
      `INSERT INTO topic_quiz_attempts (user_id, topic_id, plan_id, level, questions)
       SELECT t.user_id, t.id, $3, $4, $5::jsonb FROM custom_topics t
       LEFT JOIN topic_progress p ON p.user_id = t.user_id AND p.topic_id = t.id
       WHERE t.user_id = $1 AND t.id = $2 AND COALESCE(p.level, 'Beginner') = $4
       RETURNING id`,
      [user.id, input.data.topicId, plan.id, progress.level, JSON.stringify(questions)],
    );
    if (!saved.rows.length) return NextResponse.json({ error: 'Your topic or level changed. Please try again.' }, { status: 409 });
    return NextResponse.json({
      attemptId: saved.rows[0].id,
      questions: questions.map(({ type, prompt, options }) => ({ type, prompt, options })),
    });
  } catch (error) {
    if (error instanceof TutorLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof QuizValidationError) return NextResponse.json({ error: error.message }, { status: 503 });
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Quiz unavailable. Please try again.' }, { status: 503 });
  }
}
