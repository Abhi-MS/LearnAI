import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';
import { assessDiagram, MAX_QUESTION_LENGTH, MAX_TOPIC_LENGTH, TutorLimitError } from '../../../../lib/tutor';
import { socraticPayloadSchema } from '../../../../lib/types/socratic';

const requestSchema = z.object({
  topic: z.string().trim().min(1).max(MAX_TOPIC_LENGTH),
  answer: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  payload: socraticPayloadSchema,
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('node'), id: z.string().trim().min(1).max(40) }).strict(),
    z.object({ kind: z.literal('edge'), index: z.number().int().min(0).max(7) }).strict(),
  ]),
}).strict();

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid diagram answer.' }, { status: 400 });
  const { topic, answer, payload, target } = parsed.data;
  const expected = target.kind === 'node'
    ? payload.visualization_nodes.find((node) => node.id === target.id)?.label
    : payload.visualization_edges[target.index]?.label;
  if (!expected) return NextResponse.json({ error: 'Invalid diagram target.' }, { status: 400 });

  try {
    const assessment = await assessDiagram({ userId: user.id, topic, answer, expected, payload });
    return NextResponse.json(assessment);
  } catch (error) {
    if (error instanceof TutorLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Assessment unavailable. Please try again.' }, { status: 503 });
  }
}
