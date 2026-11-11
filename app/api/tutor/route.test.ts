import { beforeEach, describe, expect, it, vi } from 'vitest';

const topicId = 'c0a80101-0000-4000-8000-000000000001';
const query = vi.fn();

vi.mock('../../../lib/db', () => ({ getPool: () => ({ query }) }));

const payload = {
  narrative: 'An index is a sorted lookup structure.',
  analogies: ['Like a book index.'],
  socratic_questions: ['How would you find a page?'],
  visualization_nodes: [
    { id: 'index', label: 'Index', description: 'A lookup structure.' },
    { id: 'data', label: 'Data', description: 'The stored records.' },
  ],
  visualization_edges: [{ source: 'index', target: 'data', label: 'points to' }],
};

const generateContent = vi.fn().mockResolvedValue({
  text: JSON.stringify(payload),
  usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 12 },
});

vi.mock('@google/genai', () => ({
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', INTEGER: 'INTEGER' },
  GoogleGenAI: vi.fn().mockImplementation(() => ({ models: { generateContent } })),
}));

vi.mock('../../../lib/supabase-server', () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: authedUser } }) },
  }),
}));

let authedUser: { id: string } | null = { id: 'user-1' };

beforeEach(() => {
  authedUser = { id: 'user-1' };
  process.env.GEMINI_API_KEY = 'test-key';
  generateContent.mockReset().mockResolvedValue({ text: JSON.stringify(payload) });
  query.mockReset().mockImplementation((sql: string) => sql.includes('SELECT t.title')
    ? { rows: [{ title: 'Database indexing', previous_topics: [] }] }
    : { rowCount: 1 });
});

describe('POST /api/tutor', () => {
  it('rejects signed-out requests', async () => {
    authedUser = null;
    generateContent.mockClear();
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/tutor', {
        method: 'POST',
        body: JSON.stringify({ topic: 't', question: 'q' }),
      }),
    );

    expect(response.status).toBe(401);
    expect(generateContent).not.toHaveBeenCalled();
    authedUser = { id: 'user-1' };
  });

  it('requests structured JSON and forwards conversation context', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/tutor', {
        method: 'POST',
        body: JSON.stringify({
          topicId, level: 'Beginner', question: 'What is an index?',
          history: [{ role: 'tutor', payload }, { role: 'user', text: 'What is a database?' }, { role: 'tutor', payload }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ payload });
    const request = generateContent.mock.calls[0][0];
    expect(request.config.maxOutputTokens).toBe(1600);
    expect(request.config.responseMimeType).toBe('application/json');
    expect(request.config.responseSchema.required).toContain('visualization_edges');
    expect(JSON.parse(request.contents).conversation[1]).toEqual({ role: 'user', text: 'What is a database?' });
  });

  it('rejects oversized questions without calling the model', async () => {
    generateContent.mockClear();
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/tutor', {
        method: 'POST',
        body: JSON.stringify({ topicId, question: 'x'.repeat(501) }),
      }),
    );

    expect(response.status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('accepts responses and history without diagrams or analogies', async () => {
    const plainPayload = { ...payload, analogies: [], visualization_nodes: [], visualization_edges: [] };
    generateContent.mockClear();
    generateContent.mockResolvedValueOnce({ text: JSON.stringify(plainPayload) });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/tutor', {
      method: 'POST',
      body: JSON.stringify({
        topicId,
        question: 'How does that work?',
        history: [{ role: 'tutor', payload: plainPayload }],
      }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ payload: plainPayload });
    const config = generateContent.mock.calls[0][0].config;
    expect(config.responseSchema.properties.visualization_nodes.minItems).toBeUndefined();
    expect(config.responseSchema.properties.analogies.minItems).toBeUndefined();
    expect(config.responseSchema.properties.narrative.maxLength).toBe('4000');
    expect(config.systemInstruction).toContain('adapt to the technical depth');
  });

  it('rejects malformed graph output rather than returning an invalid diagram', async () => {
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ ...payload, visualization_edges: [{ source: 'index', target: 'missing', label: 'points to' }] }),
    });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/tutor', {
      method: 'POST',
      body: JSON.stringify({ topicId, question: 'Explain it' }),
    }));
    expect(response.status).toBe(503);
  });

  it('rejects an incomplete diagram', async () => {
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ ...payload, visualization_edges: [] }),
    });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/tutor', {
      method: 'POST',
      body: JSON.stringify({ topicId, question: 'Explain it' }),
    }));
    expect(response.status).toBe(503);
  });

  it('rejects malformed conversation history without calling the model', async () => {
    generateContent.mockClear();
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/tutor', {
      method: 'POST',
      body: JSON.stringify({ topicId, question: 'Explain it', history: [{ role: 'tutor', payload: {} }] }),
    }));
    expect(response.status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects oversized conversation history without calling the model', async () => {
    generateContent.mockClear();
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/tutor', {
      method: 'POST',
      body: JSON.stringify({
        topicId,
        question: 'Explain it',
        history: Array.from({ length: 130 }, () => ({ role: 'user', text: 'x'.repeat(500) })),
      }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'This conversation is too long. Please start a new topic session.' });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects missing IDs and topics not owned by the user', async () => {
    const { POST } = await import('./route');
    const missing = await POST(new Request('http://localhost/api/tutor', {
      method: 'POST', body: JSON.stringify({ topic: 'Indexes', question: 'Explain' }),
    }));
    expect(missing.status).toBe(400);
    query.mockResolvedValueOnce({ rows: [] });
    const unowned = await POST(new Request('http://localhost/api/tutor', {
      method: 'POST', body: JSON.stringify({ topicId, question: 'Explain' }),
    }));
    expect(unowned.status).toBe(404);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('t.user_id = $1 AND t.id = $2'), ['user-1', topicId, true, 50]);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('records only successful follow-ups, not lessons or failed responses', async () => {
    const { POST } = await import('./route');
    const request = (mode: string) => new Request('http://localhost/api/tutor', {
      method: 'POST', body: JSON.stringify({ topicId, mode, question: 'Explain' }),
    });
    expect((await POST(request('lesson'))).status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['user-1', topicId, false, 50]);
    generateContent.mockRejectedValueOnce(new Error('provider unavailable'));
    expect((await POST(request('chat'))).status).toBe(503);
    expect(query).toHaveBeenCalledTimes(2);
    expect((await POST(request('chat'))).status).toBe(200);
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[3][0]).toContain('INSERT INTO topic_study_history');
    expect(query.mock.calls[3][1]).toEqual(['user-1', topicId]);
  });

  it('surfaces study-history write failures rather than reporting success', async () => {
    query.mockResolvedValueOnce({ rows: [{ title: 'Database indexing', previous_topics: [] }] })
      .mockRejectedValueOnce(new Error('database unavailable'));
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/tutor', {
      method: 'POST', body: JSON.stringify({ topicId, question: 'Explain' }),
    }));
    expect(response.status).toBe(503);
  });

  it('only adds a recall checkpoint when the latest question is judged related, including later in the session', async () => {
    query.mockImplementation((sql: string, values: unknown[]) => sql.includes('SELECT t.title')
      ? { rows: [{ title: 'Database indexing', previous_topics: values[2] ? ['Concurrency', 'Transactions'] : [] }] }
      : { rowCount: 1 });
    generateContent
      .mockResolvedValueOnce({ text: JSON.stringify({ ...payload, recall_topic_index: -1 }) })
      .mockResolvedValueOnce({ text: JSON.stringify({ ...payload, recall_topic_index: 1 }) });
    const { POST } = await import('./route');
    const request = (question: string, history: unknown[]) => new Request('http://localhost/api/tutor', {
      method: 'POST', body: JSON.stringify({ topicId, question, history }),
    });
    const first = await POST(request('What is an index?', [{ role: 'tutor', payload }]));
    expect((await first.json()).payload.socratic_questions).toEqual(payload.socratic_questions);
    expect(query.mock.calls[0][0]).toContain('h.user_id = $1 AND h.topic_id <> t.id');
    expect(JSON.parse(generateContent.mock.calls[0][0].contents).previously_studied_topics).toEqual(['Concurrency', 'Transactions']);
    expect(generateContent.mock.calls[0][0].config.systemInstruction).toContain('Use -1 for unrelated questions');

    const later = await POST(request('How do atomic commits work?', [
      { role: 'user', text: 'What is an index?' }, { role: 'tutor', payload },
    ]));
    const laterPayload = (await later.json()).payload;
    expect(laterPayload.socratic_questions[1]).toContain('Transactions');
    expect(laterPayload).not.toHaveProperty('recall_topic_index');

    const afterRecall = await POST(request('What else?', [{ role: 'tutor', payload: laterPayload }]));
    expect((await afterRecall.json()).payload.socratic_questions).toEqual(payload.socratic_questions);
    expect(query.mock.calls[4][1]).toEqual(['user-1', topicId, false, 50]);
    expect(JSON.parse(generateContent.mock.calls[2][0].contents)).not.toHaveProperty('previously_studied_topics');
  });

  it('rejects invalid relevance selections without saving study history', async () => {
    query.mockResolvedValueOnce({ rows: [{ title: 'Database indexing', previous_topics: ['Transactions'] }] });
    generateContent.mockResolvedValueOnce({ text: JSON.stringify({ ...payload, recall_topic_index: 4 }) });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/tutor', {
      method: 'POST', body: JSON.stringify({ topicId, question: 'How do atomic commits work?' }),
    }));
    expect(response.status).toBe(503);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
