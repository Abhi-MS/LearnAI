import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

let pool: Pool | null = null;

export function getPool() {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!pool) {
    // Supabase poolers present a certificate chain Node doesn't trust by default.
    // sslmode in the URL would override the ssl option, so strip it.
    const isSupabase = /supabase\.(com|co)/.test(connectionString);
    pool = new Pool({
      connectionString: isSupabase
        ? connectionString.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "")
        : connectionString,
      max: 5,
      ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
}

export async function checkDatabaseHealth() {
  const db = getPool();
  const result = await db.query('SELECT 1 AS ok');

  return result.rows[0]?.ok === 1;
}
