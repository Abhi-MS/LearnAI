import { describe, expect, it, vi } from 'vitest';

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
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING' },
  GoogleGenAI: vi.fn().mockImplementation(() => ({ models: { generateContent } })),
}));

vi.mock('../../../lib/supabase-server', () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: authedUser } }) },
  }),
}));

let authedUser: { id: string } | null = { id: 'user-1' };

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
          topic: 'Database indexing', level: 'Beginner', question: 'What is an index?',
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
        body: JSON.stringify({ topic: 't', question: 'x'.repeat(501) }),
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
        topic: 'Indexes',
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
      body: JSON.stringify({ topic: 'Indexes', question: 'Explain it' }),
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
      body: JSON.stringify({ topic: 'Indexes', question: 'Explain it' }),
    }));
    expect(response.status).toBe(503);
  });

  it('rejects malformed conversation history without calling the model', async () => {
    generateContent.mockClear();
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/tutor', {
      method: 'POST',
      body: JSON.stringify({ topic: 'Indexes', question: 'Explain it', history: [{ role: 'tutor', payload: {} }] }),
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
        topic: 'Indexes',
        question: 'Explain it',
        history: Array.from({ length: 130 }, () => ({ role: 'user', text: 'x'.repeat(500) })),
      }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'This conversation is too long. Please start a new topic session.' });
    expect(generateContent).not.toHaveBeenCalled();
  });
});
