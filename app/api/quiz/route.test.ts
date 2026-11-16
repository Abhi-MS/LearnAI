import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { value: { id: 'user-1' } as { id: string } | null },
  query: vi.fn(), getProgress: vi.fn(), getQuizPlan: vi.fn(), saveQuizPlan: vi.fn(),
  getQuizAttempt: vi.fn(), recordQuizResult: vi.fn(), planQuiz: vi.fn(), generateQuiz: vi.fn(), validateQuiz: vi.fn(),
}));
vi.mock('../../../lib/db', () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock('../../../lib/supabase-server', () => ({
  createSupabaseServerClient: () => ({ auth: { getUser: async () => ({ data: { user: mocks.user.value } }) } }),
}));
vi.mock('../../../lib/quiz-store', () => ({
  getProgress: mocks.getProgress, getQuizPlan: mocks.getQuizPlan, saveQuizPlan: mocks.saveQuizPlan,
  getQuizAttempt: mocks.getQuizAttempt, recordQuizResult: mocks.recordQuizResult,
}));
vi.mock('../../../lib/quiz', () => ({
  planQuiz: mocks.planQuiz, generateQuiz: mocks.generateQuiz, validateQuiz: mocks.validateQuiz,
  QuizValidationError: class QuizValidationError extends Error {},
}));

const topicId = 'c0a80101-0000-4000-8000-000000000001';
const attemptId = 'c0a80101-0000-4000-8000-000000000002';
const planId = 'c0a80101-0000-4000-8000-000000000003';
const concepts = ['A', 'B', 'C', 'D', 'E'];
const questions = concepts.map((_, index) => ({
  conceptIndex: index, type: index < 3 ? 'multiple_choice' : 'short_answer',
  prompt: `Question ${index}`, options: index < 3 ? ['one', 'two', 'three', 'four'] : [],
  answer: 'one', explanation: 'Secret explanation',
}));
const grades = questions.map((_, questionIndex) => ({ questionIndex, correct: true, feedback: 'Good' }));
const result = { correct: 5, total: 5, passed: true, level: 'Advanced', completed: false, grades };
const request = (body: object) => new Request('http://localhost/api/quiz', { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.value = { id: 'user-1' };
  mocks.getProgress.mockResolvedValue({ title: 'Topic', level: 'Beginner', completed: false });
  mocks.getQuizPlan.mockResolvedValue({ id: planId, concepts });
  mocks.generateQuiz.mockResolvedValue(questions);
  mocks.query.mockResolvedValue({ rows: [{ id: attemptId }] });
  mocks.getQuizAttempt.mockResolvedValue({ topicId, title: 'Topic', level: 'Beginner', concepts, questions, result: null });
  mocks.validateQuiz.mockResolvedValue(grades);
  mocks.recordQuizResult.mockResolvedValue(result);
});

describe('/api/quiz', () => {
  it('requires authentication and ownership before generating a plan', async () => {
    const { POST } = await import('./route');
    mocks.user.value = null;
    expect((await POST(request({ action: 'plan', topicId }))).status).toBe(401);
    mocks.user.value = { id: 'user-1' };
    mocks.getProgress.mockResolvedValueOnce(null);
    expect((await POST(request({ action: 'plan', topicId }))).status).toBe(404);
    expect(mocks.planQuiz).not.toHaveBeenCalled();
  });

  it('stores the answer key server-side and returns only public questions', async () => {
    const { POST } = await import('./route');
    const response = await POST(request({ action: 'start', topicId }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.attemptId).toBe(attemptId);
    expect(data.questions).toHaveLength(5);
    expect(JSON.stringify(data)).not.toContain('Secret explanation');
    expect(data.questions[0]).not.toHaveProperty('answer');
    expect(mocks.query.mock.calls[0][1][4]).toContain('Secret explanation');
  });

  it('creates a level-specific plan only when one does not already exist', async () => {
    const { POST } = await import('./route');
    mocks.getQuizPlan.mockResolvedValueOnce(null);
    mocks.planQuiz.mockResolvedValueOnce(concepts);
    mocks.saveQuizPlan.mockResolvedValueOnce({ id: planId, concepts });
    const response = await POST(request({ action: 'plan', topicId }));
    expect(await response.json()).toEqual({ plan: { id: planId, level: 'Beginner', concepts }, completed: false });
    expect(mocks.planQuiz).toHaveBeenCalledWith('user-1', 'Topic', 'Beginner');
    expect(mocks.saveQuizPlan).toHaveBeenCalledWith('user-1', topicId, 'Beginner', concepts);
  });

  it('validates answers before recording and returns existing results without recording twice', async () => {
    const { POST } = await import('./route');
    const answers = ['one', 'one', 'one', 'example', 'another'];
    const response = await POST(request({ action: 'submit', attemptId, answers }));
    expect(await response.json()).toEqual({ result });
    expect(mocks.validateQuiz).toHaveBeenCalledWith('user-1', 'Topic', concepts, questions, answers);
    expect(mocks.recordQuizResult).toHaveBeenCalledOnce();
    mocks.getQuizAttempt.mockResolvedValueOnce({ topicId, title: 'Topic', level: 'Beginner', concepts, questions, result });
    expect(await (await POST(request({ action: 'submit', attemptId, answers }))).json()).toEqual({ result });
    expect(mocks.recordQuizResult).toHaveBeenCalledOnce();
  });

  it('rejects invalid options, stale levels, and failed validation without recording', async () => {
    const { POST } = await import('./route');
    const answers = ['one', 'one', 'one', 'example', 'another'];
    expect((await POST(request({ action: 'submit', attemptId, answers: ['forged', ...answers.slice(1)] }))).status).toBe(400);
    mocks.getProgress.mockResolvedValueOnce({ title: 'Topic', level: 'Advanced', completed: false });
    expect((await POST(request({ action: 'submit', attemptId, answers }))).status).toBe(409);
    mocks.validateQuiz.mockRejectedValueOnce(new Error('Failed validation'));
    expect((await POST(request({ action: 'submit', attemptId, answers }))).status).toBe(503);
    expect(mocks.recordQuizResult).not.toHaveBeenCalled();
  });
});
