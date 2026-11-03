import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/nextjs';
import { createDailyLimiter } from './limiter';

export const MAX_OUTPUT_TOKENS = 600;
export const MAX_TOPIC_LENGTH = 120;
export const MAX_QUESTION_LENGTH = 500;

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';

const consumeDaily = createDailyLimiter(Number(process.env.TUTOR_DAILY_REQUEST_LIMIT ?? 100));

export class TutorLimitError extends Error {}

export type TutorLevel = 'Beginner' | 'Advanced' | 'Pro' | 'Job Ready';

// Lessons repeat for the same topic and level, so reuse them instead of spending tokens
const lessonCache = new Map<string, string>();

export async function askTutor(input: {
  topic: string;
  level: TutorLevel;
  question?: string;
  mode?: 'chat' | 'lesson';
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const isLesson = input.mode === 'lesson';
  const cacheKey = `${input.topic}|${input.level}`;
  if (isLesson) {
    const cached = lessonCache.get(cacheKey);
    if (cached) return { answer: cached, usage: undefined };
  }

  if (!consumeDaily()) throw new TutorLimitError('Daily tutor limit reached.');

  const ai = new GoogleGenAI({ apiKey });
  const contents = isLesson
    ? `Give a short lesson overview of "${input.topic}".`
    : input.question ?? '';
  const instruction = isLesson
    ? `You are a concise tutor for developers. Write a short lesson overview of the topic for a ${input.level} learner: ` +
      'a 2-sentence summary, 3 key concepts as bullets, and one concrete example. Under 200 words. ' +
      'End with one question inviting the learner to ask more.'
    : `You are a concise tutor for developers. Topic: ${input.topic}. ` +
      `Learner level: ${input.level}. Explain fundamentals with one concrete example. ` +
      'Stay on the topic and keep the answer under 250 words.';

  return Sentry.startSpan(
    {
      name: `chat ${MODEL}`,
      op: 'gen_ai.chat',
      attributes: {
        'gen_ai.system': 'gemini',
        'gen_ai.request.model': MODEL,
        'gen_ai.request.max_tokens': MAX_OUTPUT_TOKENS,
      },
    },
    async (span) => {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: { maxOutputTokens: MAX_OUTPUT_TOKENS, systemInstruction: instruction },
      });

      const usage = response.usageMetadata;
      span.setAttributes({
        'gen_ai.usage.input_tokens': usage?.promptTokenCount ?? 0,
        'gen_ai.usage.output_tokens': usage?.candidatesTokenCount ?? 0,
      });

      const answer = response.text ?? '';
      if (isLesson && answer) lessonCache.set(cacheKey, answer);

      return { answer, usage };
    },
  );
}
