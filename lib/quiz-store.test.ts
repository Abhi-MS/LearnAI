import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordQuizResult } from './quiz-store';
import type { QuizGrades } from './types/quiz';

const query = vi.fn();
vi.mock('./learning', () => ({ withUserLearningTransaction: (_user: string, work: (client: { query: typeof query }) => unknown) => work({ query }) }));

const concepts = ['A', 'B', 'C', 'D', 'E'];
const indexes = [0, 1, 2, 3, 4];
const grades = (correct: number): QuizGrades => indexes.map((index) => ({
  questionIndex: index, correct: index < correct, feedback: 'Feedback',
}));

beforeEach(() => {
  query.mockReset().mockImplementation((sql: string) => {
    if (sql.startsWith('SELECT result')) return { rows: [{ result: null }] };
    if (sql.startsWith('SELECT level')) return { rows: [{ level: 'Beginner', completed: false }] };
    return { rows: [] };
  });
});

describe('recordQuizResult', () => {
  it('promotes at exactly 80% and records the missed concept', async () => {
    const result = await recordQuizResult('user', 'attempt', 'topic', 'Beginner', concepts, grades(4), indexes);
    expect(result).toMatchObject({ correct: 4, total: 5, passed: true, level: 'Advanced', completed: false });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO topic_concept_gaps'), ['user', 'topic', 'E']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO topic_quiz_results'), ['attempt', 'user', 'topic', 'Beginner', 4, true]);
  });

  it('keeps the level below 80% and marks Job Ready complete only after a pass', async () => {
    expect(await recordQuizResult('user', 'attempt', 'topic', 'Beginner', concepts, grades(3), indexes))
      .toMatchObject({ passed: false, level: 'Beginner', completed: false });
    query.mockImplementation((sql: string) => {
      if (sql.startsWith('SELECT result')) return { rows: [{ result: null }] };
      if (sql.startsWith('SELECT level')) return { rows: [{ level: 'Job Ready', completed: false }] };
      return { rows: [] };
    });
    expect(await recordQuizResult('user', 'attempt', 'topic', 'Job Ready', concepts, grades(4), indexes))
      .toMatchObject({ passed: true, level: 'Job Ready', completed: true });
  });

  it('does not record a stale or already-completed attempt twice', async () => {
    const previous = { correct: 4, total: 5, passed: true, level: 'Advanced', completed: false, grades: grades(4) };
    query.mockResolvedValueOnce({ rows: [{ result: previous }] });
    expect(await recordQuizResult('user', 'attempt', 'topic', 'Beginner', concepts, grades(4), indexes)).toEqual(previous);
    expect(query).toHaveBeenCalledTimes(1);
    query.mockReset().mockImplementation((sql: string) => {
      if (sql.startsWith('SELECT result')) return { rows: [{ result: null }] };
      if (sql.startsWith('SELECT level')) return { rows: [{ level: 'Advanced', completed: false }] };
      return { rows: [] };
    });
    expect(await recordQuizResult('user', 'attempt', 'topic', 'Beginner', concepts, grades(4), indexes)).toBeNull();
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO topic_quiz_results'))).toBe(false);
  });
});
