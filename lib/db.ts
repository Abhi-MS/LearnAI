import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

let pool: Pool | null = null;

export function getPool() {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!pool) {
    const url = connectionString.startsWith('/') ? null : new URL(connectionString);
    const host = url?.hostname.toLowerCase() ?? '';
    const isSupabase = host.endsWith('.supabase.co') || host.endsWith('.supabase.com');
    let ssl;
    if (isSupabase && url) {
      const forbidden = ['host', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'];
      if (forbidden.some((parameter) => url.searchParams.has(parameter))) {
        throw new Error('Unsupported database connection parameter. Configure the Supabase CA using SUPABASE_DB_CA_CERT.');
      }
      const modes = url.searchParams.getAll('sslmode');
      if (modes.some((mode) => mode !== 'require' && mode !== 'verify-full')) {
        throw new Error('Supabase connections require TLS certificate and hostname verification.');
      }
      url.searchParams.delete('sslmode');
      const ca = process.env.SUPABASE_DB_CA_CERT?.replace(/\\n/g, '\n');
      ssl = ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
    }
    pool = new Pool({
      connectionString: isSupabase && url ? url.toString() : connectionString,
      max: 5,
      ssl,
    });
  }

  return pool;
}

export async function checkDatabaseHealth() {
  const db = getPool();
  const result = await db.query('SELECT 1 AS ok');

  return result.rows[0]?.ok === 1;
}
