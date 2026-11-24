// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { askTutor } from './tutor';

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

it('retries temporary 503 responses and returns a successful tutor response', async () => {
  vi.useFakeTimers();
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 503, message: 'Unavailable' } }), { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 503, message: 'Unavailable' } }), { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(payload) }] }, finishReason: 'STOP' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const result = askTutor({ userId: 'retry-user', topic: 'Test', level: 'Beginner', question: 'Explain' });
  await vi.runAllTimersAsync();
  await expect(result).resolves.toMatchObject({ payload });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('does not retry non-503 provider errors', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: { code: 400, message: 'Invalid request' } }), { status: 400 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  await expect(askTutor({ userId: 'non-retry-user', topic: 'Test', level: 'Beginner', question: 'Explain' })).rejects.toMatchObject({ status: 400 });
  expect(fetchMock).toHaveBeenCalledOnce();
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
