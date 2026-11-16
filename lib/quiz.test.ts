import { beforeEach, expect, it, vi } from 'vitest';
import { generateQuiz, QuizValidationError, validateQuiz } from './quiz';
import type { QuizQuestions } from './types/quiz';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', INTEGER: 'INTEGER', BOOLEAN: 'BOOLEAN' },
  GoogleGenAI: vi.fn().mockImplementation(() => ({ models: { generateContent } })),
}));

const concepts = ['A', 'B', 'C', 'D', 'E'];
const questions: QuizQuestions = concepts.map((_, index) => ({
  conceptIndex: index, type: index < 3 ? 'multiple_choice' : 'short_answer',
  prompt: `Question ${index}`, options: index < 3 ? ['one', 'two', 'three', 'four'] : [],
  answer: 'one', explanation: 'Explanation',
}));
const answers = ['one', 'one', 'one', 'Equivalent answer', 'Another answer'];
const validation = questions.map((_, index) => ({ questionIndex: index, correct: true, validQuestion: true, feedback: 'Good' }));

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  generateContent.mockReset();
});

it('rejects generated quizzes that do not contain the requested mix', async () => {
  generateContent.mockResolvedValueOnce({ text: JSON.stringify({ questions: questions.map((question) => ({ ...question, type: 'short_answer', options: [] })) }) });
  await expect(generateQuiz('quiz-test-1', 'Topic', 'Beginner', concepts)).rejects.toThrow();
});

it('uses two independent checks and accepts equivalent short answers only when they agree', async () => {
  generateContent.mockResolvedValue({ text: JSON.stringify({ grades: validation }) });
  const result = await validateQuiz('quiz-test-2', 'Topic', concepts, questions, answers);
  expect(result).toHaveLength(5);
  expect(result.every((item) => item.correct)).toBe(true);
  expect(generateContent).toHaveBeenCalledTimes(2);
  expect(generateContent.mock.calls[1][0].config.systemInstruction).toContain('independent second-pass');
});

it('rejects disagreement, invalid questions, and multiple-choice grades that disagree with the key', async () => {
  generateContent.mockResolvedValueOnce({ text: JSON.stringify({ grades: validation }) })
    .mockResolvedValueOnce({ text: JSON.stringify({ grades: validation.map((grade, index) => index === 4 ? { ...grade, correct: false } : grade) }) });
  await expect(validateQuiz('quiz-test-3', 'Topic', concepts, questions, answers)).rejects.toBeInstanceOf(QuizValidationError);
  generateContent.mockResolvedValue({ text: JSON.stringify({ grades: validation.map((grade, index) => index === 0 ? { ...grade, validQuestion: false } : grade) }) });
  await expect(validateQuiz('quiz-test-4', 'Topic', concepts, questions, answers)).rejects.toBeInstanceOf(QuizValidationError);
  generateContent.mockResolvedValue({ text: JSON.stringify({ grades: validation }) });
  await expect(validateQuiz('quiz-test-5', 'Topic', concepts, questions, ['two', ...answers.slice(1)])).rejects.toBeInstanceOf(QuizValidationError);
});
