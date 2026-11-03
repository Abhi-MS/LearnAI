import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import {
  askTutor,
  MAX_QUESTION_LENGTH,
  MAX_TOPIC_LENGTH,
  TutorLimitError,
  type TutorLevel,
} from '../../../lib/tutor';

export const dynamic = 'force-dynamic';

const LEVELS: TutorLevel[] = ['Beginner', 'Advanced', 'Pro', 'Job Ready'];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  const level: TutorLevel = LEVELS.includes(body?.level) ? body.level : 'Beginner';

  if (!topic || !question) {
    return NextResponse.json({ error: 'topic and question are required' }, { status: 400 });
  }
  if (topic.length > MAX_TOPIC_LENGTH || question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: 'Input too long' }, { status: 400 });
  }

  try {
    const { answer } = await askTutor({ topic, level, question });
    return NextResponse.json({ answer });
  } catch (error) {
    if (error instanceof TutorLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Tutor unavailable' }, { status: 503 });
  }
}
