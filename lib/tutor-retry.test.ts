// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { assessDiagram, askTutor, summarizeTopic } from './tutor';
import { generateLearningCategories } from './learning-generation';
import { generateQuiz } from './quiz';

const payload = {
  narrative: 'A short explanation.',
  analogies: [],
  conversation_question: 'What next?',
  socratic_questions: [],
  visualization_nodes: [],
  visualization_edges: [],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([429, 503])('retries temporary %i responses and returns a successful tutor response', async (status) => {
  vi.useFakeTimers();
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: status, message: 'Unavailable' } }), { status }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: status, message: 'Unavailable' } }), { status }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(payload) }] }, finishReason: 'STOP' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const result = askTutor({ userId: 'retry-user', topic: 'Test', level: 'Beginner', question: 'Explain' });
  await vi.runAllTimersAsync();
  await expect(result).resolves.toMatchObject({ payload });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('does not retry non-transient provider errors', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: { code: 400, message: 'Invalid request' } }), { status: 400 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  await expect(askTutor({ userId: 'non-retry-user', topic: 'Test', level: 'Beginner', question: 'Explain' })).rejects.toMatchObject({ status: 400 });
  expect(fetchMock).toHaveBeenCalledOnce();
});

const categories = ['A', 'B', 'C'].map((name) => ({ name, topics: [`${name}1`, `${name}2`] }));
const concepts = ['A', 'B', 'C', 'D', 'E'];
const questions = concepts.map((_, conceptIndex) => ({
  conceptIndex,
  type: conceptIndex < 3 ? 'multiple_choice' : 'short_answer',
  prompt: `Question ${conceptIndex}`,
  options: conceptIndex < 3 ? ['one', 'two', 'three', 'four'] : [],
  answer: 'one',
  explanation: 'Explanation',
}));

it.each([
  {
    feature: 'exploration planning',
    output: { categories },
    run: () => generateLearningCategories('Test'),
  },
  {
    feature: 'quiz generation',
    output: { questions },
    run: () => generateQuiz('quiz-retry-user', 'Test', 'Beginner', concepts),
  },
  {
    feature: 'topic summaries',
    output: { note: 'Summary', depth: 'introductory', nextStep: 'Continue' },
    run: () => summarizeTopic({ userId: 'summary-retry-user', topic: 'Test', history: [], previousNote: null }),
  },
  {
    feature: 'diagram assessment',
    output: { correct: true, feedback: 'Correct' },
    run: () => assessDiagram({ userId: 'diagram-retry-user', topic: 'Test', answer: 'A', expected: 'A', payload }),
  },
])('retries a transient failure during $feature', async ({ output, run }) => {
  vi.useFakeTimers();
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 503, message: 'Unavailable' } }), { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(output) }] }, finishReason: 'STOP' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const result = run();
  await vi.runAllTimersAsync();
  await expect(result).resolves.toBeDefined();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('surfaces a persistent 503 after the bounded retries', async () => {
  vi.useFakeTimers();
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  const fetchMock = vi.fn().mockImplementation(async () =>
    new Response(JSON.stringify({ error: { code: 503, message: 'Unavailable' } }), { status: 503 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const result = askTutor({ userId: 'outage-user', topic: 'Test', level: 'Beginner', question: 'Explain' });
  const rejection = expect(result).rejects.toMatchObject({ status: 503 });
  await vi.runAllTimersAsync();
  await rejection;
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
