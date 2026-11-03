import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/nextjs';
import { createDailyLimiter, createKeyedDailyLimiter } from './limiter';

export const MAX_OUTPUT_TOKENS = 600;
export const MAX_TOPIC_LENGTH = 120;
export const MAX_QUESTION_LENGTH = 500;

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';

// Global cap protects the API budget; the per-user cap keeps one user from using it all up
const consumeGlobal = createDailyLimiter(Number(process.env.TUTOR_DAILY_REQUEST_LIMIT ?? 100));
const consumeUser = createKeyedDailyLimiter(Number(process.env.TUTOR_USER_DAILY_LIMIT ?? 30));

export class TutorLimitError extends Error {}

export type TutorLevel = 'Beginner' | 'Advanced' | 'Pro' | 'Job Ready';

// Lessons repeat for the same topic and level, so reuse them instead of spending tokens
const lessonCache = new Map<string, string>();

export async function askTutor(input: {
  userId: string;
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

  if (!consumeUser(input.userId)) {
    throw new TutorLimitError('Daily tutor limit reached. Try again tomorrow.');
  }
  if (!consumeGlobal()) throw new TutorLimitError('Tutor is at capacity today. Try again tomorrow.');

  const ai = new GoogleGenAI({ apiKey });
  const contents = isLesson
    ? `Give a short lesson overview of "${input.topic}".`
    : input.question ?? '';
  const instruction = isLesson
    ? `You are a professional, concise tutor for developers. Write the opening lesson card for a ${input.level} learner, in Markdown, ` +
      'using exactly this structure: a "## " heading with the topic name; a one-to-two sentence description of what the topic is; ' +
      'a small plain-text ASCII diagram (max 8 lines, under 40 characters wide) inside a fenced code block showing how the key parts relate; ' +
      'a "**Key ideas**" line followed by 3 short bullets; then a final line starting with "**Let\'s explore:**" ' +
      'asking one engaging question that motivates the learner to reply. Under 150 words total. No greeting, no filler.'
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
