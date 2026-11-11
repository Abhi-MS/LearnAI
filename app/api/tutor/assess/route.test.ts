import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
let user: { id: string } | null = { id: 'assessment-user' };
vi.mock('@google/genai', () => ({
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', BOOLEAN: 'BOOLEAN' },
  GoogleGenAI: vi.fn().mockImplementation(() => ({ models: { generateContent } })),
}));
vi.mock('../../../../lib/supabase-server', () => ({
  createSupabaseServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}));

const payload = {
  narrative: 'Overview', analogies: [], socratic_questions: ['Why?'],
  visualization_nodes: [
    { id: 'a', label: 'Alpha', description: 'First.' },
    { id: 'b', label: 'Beta', description: 'Second.' },
  ],
  visualization_edges: [{ source: 'a', target: 'b', label: 'connects' }],
};
const input = { topic: 'Example', payload, target: { kind: 'edge', index: 0 }, answer: 'links' };
const request = (body: unknown) => new Request('http://localhost/api/tutor/assess', {
  method: 'POST', body: JSON.stringify(body),
});

beforeEach(() => {
  user = { id: 'assessment-user' };
  process.env.GEMINI_API_KEY = 'test-key';
  generateContent.mockReset().mockResolvedValue({ text: JSON.stringify({ correct: true, feedback: 'Correct.' }) });
});

describe('POST /api/tutor/assess', () => {
  it('requires authentication and validates the graph, target, and answer', async () => {
    const { POST } = await import('./route');
    user = null;
    expect((await POST(request(input))).status).toBe(401);
    user = { id: 'assessment-user' };
    expect((await POST(request({ ...input, target: { kind: 'edge', index: 2 } }))).status).toBe(400);
    expect((await POST(request({ ...input, answer: 'x'.repeat(501) }))).status).toBe(400);
    expect((await POST(request({ ...input, payload: { ...payload, visualization_edges: [] } }))).status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('sends the selected label and accepts bounded structured feedback', async () => {
    const { POST } = await import('./route');
    const response = await POST(request(input));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ correct: true, feedback: 'Correct.' });
    const call = generateContent.mock.calls[0][0];
    expect(JSON.parse(call.contents)).toMatchObject({ expected_label: 'connects', learner_answer: 'links' });
    expect(call.config.responseMimeType).toBe('application/json');
    expect(call.config.responseSchema.properties.correct.type).toBe('BOOLEAN');
  });

  it('surfaces provider and invalid assessment failures without returning a result', async () => {
    const { POST } = await import('./route');
    generateContent.mockResolvedValueOnce({ text: JSON.stringify({ correct: 'yes', feedback: 'Great' }) });
    expect((await POST(request(input))).status).toBe(503);
    generateContent.mockRejectedValueOnce(new Error('provider failed'));
    expect((await POST(request(input))).status).toBe(503);
  });

  it('shares the per-user request limit with tutor responses', async () => {
    const previousLimit = process.env.TUTOR_USER_DAILY_LIMIT;
    process.env.TUTOR_USER_DAILY_LIMIT = '1';
    vi.resetModules();
    try {
      const { askTutor, assessDiagram, TutorLimitError } = await import('../../../../lib/tutor');
      generateContent.mockResolvedValueOnce({ text: JSON.stringify(payload) });
      await askTutor({ userId: 'limit-test', topic: 'Example', level: 'Beginner', mode: 'chat', question: 'Why?' });
      await expect(assessDiagram({
        userId: 'limit-test', topic: 'Example', answer: 'links', expected: 'connects', payload,
      })).rejects.toBeInstanceOf(TutorLimitError);
      expect(generateContent).toHaveBeenCalledTimes(1);
    } finally {
      if (previousLimit === undefined) delete process.env.TUTOR_USER_DAILY_LIMIT;
      else process.env.TUTOR_USER_DAILY_LIMIT = previousLimit;
      vi.resetModules();
    }
  });
});
