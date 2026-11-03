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

export async function askTutor(input: { topic: string; level: TutorLevel; question: string }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
  if (!consumeDaily()) throw new TutorLimitError('Daily tutor limit reached.');

  const ai = new GoogleGenAI({ apiKey });

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
        contents: input.question,
        config: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          systemInstruction:
            `You are a concise tutor for developers. Topic: ${input.topic}. ` +
            `Learner level: ${input.level}. Explain fundamentals with one concrete example. ` +
            'Stay on the topic and keep the answer under 250 words.',
        },
      });

      const usage = response.usageMetadata;
      span.setAttributes({
        'gen_ai.usage.input_tokens': usage?.promptTokenCount ?? 0,
        'gen_ai.usage.output_tokens': usage?.candidatesTokenCount ?? 0,
      });

      return { answer: response.text ?? '', usage };
    },
  );
}
