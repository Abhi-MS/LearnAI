import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TutorHistory } from '../../../../lib/types/socratic';

const query = vi.fn();
const generateContent = vi.fn();
let user: { id: string } | null = { id: 'user-1' };
vi.mock('../../../../lib/db', () => ({ getPool: () => ({ query }) }));
vi.mock('../../../../lib/supabase-server', () => ({
  createSupabaseServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}));
vi.mock('@google/genai', () => ({
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', INTEGER: 'INTEGER' },
  GoogleGenAI: vi.fn().mockImplementation(() => ({ models: { generateContent } })),
}));

const topicId = 'c0a80101-0000-4000-8000-000000000001';
const tutor = {
  narrative: 'Explanation', analogies: [], socratic_questions: ['Why?'],
  visualization_nodes: [], visualization_edges: [],
};
const history: TutorHistory = [{ role: 'tutor', payload: tutor }, { role: 'user', text: 'How?' }, { role: 'tutor', payload: tutor }];
const note = { note: 'Concepts discussed.', depth: 'developing', nextStep: 'Explore examples.' };
const existing = { title: 'Concurrency', note: 'Earlier ideas.', depth: 'introductory', next_step: 'Discuss threads.', revision: 3 };
const post = (body: unknown) => new Request('http://localhost/api/tutor/summary', {
  method: 'POST', body: JSON.stringify(body),
});
const get = () => new Request(`http://localhost/api/tutor/summary?topicId=${topicId}`);

beforeEach(() => {
  user = { id: 'user-1' };
  process.env.GEMINI_API_KEY = 'test-key';
  query.mockReset();
  generateContent.mockReset().mockResolvedValue({ text: JSON.stringify(note) });
});

describe('/api/tutor/summary', () => {
  it('requires authentication and checks ownership before reading or generating', async () => {
    const { GET, POST } = await import('./route');
    user = null;
    expect((await GET(get())).status).toBe(401);
    expect((await POST(post({ topicId, history }))).status).toBe(401);
    user = { id: 'user-1' };
    query.mockResolvedValue({ rows: [] });
    expect((await GET(get())).status).toBe(404);
    expect((await POST(post({ topicId, history }))).status).toBe(404);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE t.user_id = $1 AND t.id = $2'), ['user-1', topicId]);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('loads the saved note without calling Gemini', async () => {
    query.mockResolvedValueOnce({ rows: [existing] });
    const { GET } = await import('./route');
    const response = await GET(get());
    expect(await response.json()).toEqual({
      note: { note: 'Earlier ideas.', depth: 'introductory', nextStep: 'Discuss threads.', revision: 3 },
    });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects invalid, oversized, and incomplete conversations', async () => {
    const { POST } = await import('./route');
    expect((await POST(post({ topicId, history: [{ role: 'tutor', payload: tutor }] }))).status).toBe(400);
    expect((await POST(post({ topicId, history: [{ role: 'user', text: 'x'.repeat(501) }] }))).status).toBe(400);
    expect((await POST(post({
      topicId, history: Array.from({ length: 250 }, () => ({ role: 'user', text: 'x'.repeat(500) })),
    }))).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('merges prior notes and writes only the validated summary with an optimistic revision', async () => {
    query.mockResolvedValueOnce({ rows: [existing] }).mockResolvedValueOnce({ rows: [{ revision: 4 }] });
    const { POST } = await import('./route');
    const response = await POST(post({ topicId, history }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ note: { ...note, revision: 4 } });
    const sent = JSON.parse(generateContent.mock.calls[0][0].contents);
    expect(sent.previous_note).toEqual({ note: 'Earlier ideas.', depth: 'introductory', nextStep: 'Discuss threads.' });
    expect(sent.conversation).toEqual(history);
    expect(query.mock.calls[1][0]).toContain('WHERE topic_notes.revision = $6::integer');
    expect(query.mock.calls[1][1]).toEqual(['user-1', topicId, note.note, note.depth, note.nextStep, 3]);
  });

  it('creates a first note without storing the conversation', async () => {
    query.mockResolvedValueOnce({ rows: [{ title: 'Concurrency', note: null, depth: null, next_step: null, revision: null }] })
      .mockResolvedValueOnce({ rows: [{ revision: 1 }] });
    const { POST } = await import('./route');
    const response = await POST(post({ topicId, history }));
    expect(await response.json()).toEqual({ note: { ...note, revision: 1 } });
    expect(query.mock.calls[1][1]).toEqual(['user-1', topicId, note.note, note.depth, note.nextStep, null]);
  });

  it('can save a final reply even when the conversation has grown beyond the tutor request limit', async () => {
    query.mockResolvedValueOnce({ rows: [existing] }).mockResolvedValueOnce({ rows: [{ revision: 4 }] });
    const longHistory: TutorHistory = [
      ...Array.from({ length: 130 }, () => ({ role: 'user' as const, text: 'x'.repeat(500) })),
      { role: 'tutor', payload: tutor },
    ];
    const { POST } = await import('./route');
    expect((await POST(post({ topicId, history: longHistory }))).status).toBe(200);
  });

  it('does not overwrite a concurrent note or persist malformed model output', async () => {
    const { POST } = await import('./route');
    query.mockResolvedValueOnce({ rows: [existing] }).mockResolvedValueOnce({ rows: [] });
    expect((await POST(post({ topicId, history }))).status).toBe(409);
    query.mockReset().mockResolvedValueOnce({ rows: [existing] });
    generateContent.mockResolvedValueOnce({ text: JSON.stringify({ ...note, depth: 'expert' }) });
    expect((await POST(post({ topicId, history }))).status).toBe(503);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('shares the tutor request limit with summaries', async () => {
    const priorLimit = process.env.TUTOR_USER_DAILY_LIMIT;
    process.env.TUTOR_USER_DAILY_LIMIT = '1';
    vi.resetModules();
    try {
      const { askTutor, summarizeTopic, TutorLimitError } = await import('../../../../lib/tutor');
      generateContent.mockResolvedValueOnce({ text: JSON.stringify(tutor) });
      await askTutor({ userId: 'limit-test', topic: 'Concurrency', level: 'Beginner', mode: 'chat', question: 'Why?' });
      await expect(summarizeTopic({ userId: 'limit-test', topic: 'Concurrency', history, previousNote: null }))
        .rejects.toBeInstanceOf(TutorLimitError);
      expect(generateContent).toHaveBeenCalledTimes(1);
    } finally {
      if (priorLimit === undefined) delete process.env.TUTOR_USER_DAILY_LIMIT;
      else process.env.TUTOR_USER_DAILY_LIMIT = priorLimit;
      vi.resetModules();
    }
  });
});
