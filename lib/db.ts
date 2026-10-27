import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

let pool: Pool | null = null;

export function getPool() {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!pool) {
    pool = new Pool({ connectionString, max: 5 });
  }

  return pool;
}

export async function checkDatabaseHealth() {
  const db = getPool();
  const result = await db.query('SELECT 1 AS ok');

  return result.rows[0]?.ok === 1;
}
