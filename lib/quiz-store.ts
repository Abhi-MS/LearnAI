import { getPool } from './db';
import { withUserLearningTransaction } from './learning';
import { LEVELS, type Level } from './levels';
import { conceptsSchema, levelSchema, quizQuestionsSchema, quizResultSchema, type QuizGrades, type QuizResult } from './types/quiz';

export async function getProgress(userId: string, topicId: string) {
  const result = await getPool().query<{ title: string; level: string; completed: boolean }>(
    `SELECT t.title, COALESCE(p.level, 'Beginner') AS level, COALESCE(p.completed, FALSE) AS completed
     FROM custom_topics t LEFT JOIN topic_progress p ON p.user_id = t.user_id AND p.topic_id = t.id
     WHERE t.user_id = $1 AND t.id = $2`,
    [userId, topicId],
  );
  const row = result.rows[0];
  return row ? { ...row, level: levelSchema.parse(row.level) } : null;
}

export async function getQuizPlan(userId: string, topicId: string, level: Level) {
  const result = await getPool().query<{ id: string; concepts: unknown }>(
    'SELECT id, concepts FROM topic_quiz_plans WHERE user_id = $1 AND topic_id = $2 AND level = $3',
    [userId, topicId, level],
  );
  const row = result.rows[0];
  return row ? { id: row.id, concepts: conceptsSchema.parse(row.concepts) } : null;
}

export async function saveQuizPlan(userId: string, topicId: string, level: Level, concepts: string[]) {
  const result = await getPool().query<{ id: string; concepts: unknown }>(
    `INSERT INTO topic_quiz_plans (user_id, topic_id, level, concepts)
     SELECT t.user_id, t.id, $3, $4::jsonb FROM custom_topics t
     LEFT JOIN topic_progress p ON p.user_id = t.user_id AND p.topic_id = t.id
     WHERE t.user_id = $1 AND t.id = $2 AND COALESCE(p.level, 'Beginner') = $3
     ON CONFLICT (user_id, topic_id, level) DO UPDATE SET concepts = topic_quiz_plans.concepts
     RETURNING id, concepts`,
    [userId, topicId, level, JSON.stringify(concepts)],
  );
  const row = result.rows[0];
  return row ? { id: row.id, concepts: conceptsSchema.parse(row.concepts) } : null;
}

export async function getQuizAttempt(userId: string, attemptId: string) {
  const result = await getPool().query<{
    topic_id: string; level: string; questions: unknown; result: unknown; concepts: unknown; title: string;
  }>(
    `SELECT a.topic_id, a.level, a.questions, a.result, p.concepts, t.title
     FROM topic_quiz_attempts a
     JOIN topic_quiz_plans p ON p.id = a.plan_id AND p.user_id = a.user_id AND p.topic_id = a.topic_id
     JOIN custom_topics t ON t.id = a.topic_id AND t.user_id = a.user_id
     WHERE a.id = $1 AND a.user_id = $2`,
    [attemptId, userId],
  );
  const row = result.rows[0];
  return row ? {
    topicId: row.topic_id, level: levelSchema.parse(row.level), title: row.title,
    questions: quizQuestionsSchema.parse(row.questions), concepts: conceptsSchema.parse(row.concepts),
    result: row.result === null ? null : quizResultSchema.parse(row.result),
  } : null;
}

export async function recordQuizResult(
  userId: string, attemptId: string, topicId: string, level: Level, concepts: string[],
  grades: QuizGrades, conceptIndexes: number[],
): Promise<QuizResult | null> {
  return withUserLearningTransaction(userId, async (client) => {
    const attempt = await client.query<{ result: unknown }>(
      'SELECT result FROM topic_quiz_attempts WHERE id = $1 AND user_id = $2 AND topic_id = $3 FOR UPDATE',
      [attemptId, userId, topicId],
    );
    if (!attempt.rows.length) return null;
    if (attempt.rows[0].result !== null) return quizResultSchema.parse(attempt.rows[0].result);
    await client.query(
      `INSERT INTO topic_progress (user_id, topic_id)
       SELECT user_id, id FROM custom_topics WHERE user_id = $1 AND id = $2
       ON CONFLICT (user_id, topic_id) DO NOTHING`,
      [userId, topicId],
    );
    const progress = await client.query<{ level: string; completed: boolean }>(
      'SELECT level, completed FROM topic_progress WHERE user_id = $1 AND topic_id = $2 FOR UPDATE',
      [userId, topicId],
    );
    if (!progress.rows.length || progress.rows[0].level !== level) return null;
    const correct = grades.filter((grade) => grade.correct).length;
    const passed = correct * 100 >= 80 * grades.length;
    const nextLevel = passed ? LEVELS[Math.min(LEVELS.indexOf(level) + 1, LEVELS.length - 1)] : level;
    const completed = progress.rows[0].completed || (passed && level === 'Job Ready');
    const result: QuizResult = { correct, total: 5, passed, level: nextLevel, completed, grades };
    await client.query('UPDATE topic_progress SET level = $3, completed = $4 WHERE user_id = $1 AND topic_id = $2', [userId, topicId, nextLevel, completed]);
    await client.query(
      `INSERT INTO topic_quiz_results (attempt_id, user_id, topic_id, level, correct_answers, total_questions, passed)
       VALUES ($1, $2, $3, $4, $5, 5, $6)`,
      [attemptId, userId, topicId, level, correct, passed],
    );
    for (const grade of grades) {
      if (!grade.correct) {
        await client.query(
          `INSERT INTO topic_concept_gaps (user_id, topic_id, concept) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, topic_id, concept) DO UPDATE SET missed_count = topic_concept_gaps.missed_count + 1, updated_at = NOW()`,
          [userId, topicId, concepts[conceptIndexes[grade.questionIndex]]],
        );
      }
    }
    await client.query('UPDATE topic_quiz_attempts SET result = $3::jsonb, completed_at = NOW() WHERE id = $1 AND user_id = $2', [attemptId, userId, JSON.stringify(result)]);
    return result;
  });
}
