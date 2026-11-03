import { describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn().mockResolvedValue({
  text: 'An index is a sorted lookup structure.',
  usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 12 },
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({ models: { generateContent } })),
}));

describe('POST /api/tutor', () => {
  it('caps output tokens and returns the answer', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/tutor', {
        method: 'POST',
        body: JSON.stringify({ topic: 'Database indexing', level: 'Beginner', question: 'What is an index?' }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ answer: 'An index is a sorted lookup structure.' });
    expect(generateContent.mock.calls[0][0].config.maxOutputTokens).toBe(600);
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
});
