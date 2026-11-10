import type { PoolClient } from 'pg';
import { getPool } from './db';

export async function withUserLearningTransaction<T>(
  userId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureCategory(client: PoolClient, userId: string, areaId: string, name: string) {
  const result = await client.query<{ id: string; name: string }>(
    `INSERT INTO learning_categories (user_id, area_id, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (area_id, lower(btrim(name))) WHERE area_id IS NOT NULL
     DO UPDATE SET name = learning_categories.name
     RETURNING id, name`,
    [userId, areaId, name],
  );
  return result.rows[0];
}
