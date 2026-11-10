import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({ models: { generateContent } })),
}));
import { generateLearningCategories } from './learning-generation';

describe('generateLearningCategories', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    generateContent.mockReset();
  });

  it('accepts exactly three distinct categories with two topics each', async () => {
    const categories = [
      { name: 'A', topics: ['A1', 'A2'] },
      { name: 'B', topics: ['B1', 'B2'] },
      { name: 'C', topics: ['C1', 'C2'] },
    ];
    generateContent.mockResolvedValue({ text: JSON.stringify({ categories }) });
    await expect(generateLearningCategories('Music')).resolves.toEqual(categories);
    expect(generateContent.mock.calls[0][0].config.responseMimeType).toBe('application/json');
  });

  it.each([
    { categories: [] },
    { categories: [{ name: 'A', topics: ['A1', 'A2'] }, { name: 'a', topics: ['B1', 'B2'] }, { name: 'C', topics: ['C1', 'C2'] }] },
    { categories: [{ name: 'A', topics: ['A1', 'a1'] }, { name: 'B', topics: ['B1', 'B2'] }, { name: 'C', topics: ['C1', 'C2'] }] },
  ])('rejects malformed or duplicate output', async (output) => {
    generateContent.mockResolvedValue({ text: JSON.stringify(output) });
    await expect(generateLearningCategories('Music')).rejects.toThrow();
  });
});
