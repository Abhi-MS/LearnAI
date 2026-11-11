import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pool } = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock('pg', () => ({ Pool: pool }));

describe('database TLS configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    pool.mockReset();
    pool.mockImplementation(function () { return {}; });
    vi.stubEnv('SUPABASE_DB_CA_CERT', '');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('requires verification for Supabase poolers and preserves other URL parameters', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:password@pooler.supabase.com:6543/postgres?sslmode=require&application_name=test');
    const { getPool } = await import('./db');
    getPool();
    expect(pool).toHaveBeenCalledWith({
      connectionString: 'postgresql://user:password@pooler.supabase.com:6543/postgres?application_name=test',
      max: 5,
      ssl: { rejectUnauthorized: true },
    });
  });

  it('uses the configured CA with hostname verification enabled', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:password@db.example.supabase.co/postgres');
    vi.stubEnv('SUPABASE_DB_CA_CERT', 'first\\nsecond');
    const { getPool } = await import('./db');
    getPool();
    expect(pool.mock.calls[0][0].ssl).toEqual({ rejectUnauthorized: true, ca: 'first\nsecond' });
  });

  it.each(['sslmode=no-verify', 'sslmode=disable', 'ssl=false', 'host=attacker.test', 'uselibpqcompat=true'])(
    'rejects unsafe connection parameter %s', async (parameter) => {
      vi.stubEnv('DATABASE_URL', `postgresql://user:password@db.example.supabase.co/postgres?${parameter}`);
      const { getPool } = await import('./db');
      expect(() => getPool()).toThrow();
      expect(pool).not.toHaveBeenCalled();
    },
  );

  it('preserves non-Supabase connection configuration', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/test');
    const { getPool } = await import('./db');
    getPool();
    expect(pool).toHaveBeenCalledWith({ connectionString: 'postgresql://localhost:5432/test', max: 5, ssl: undefined });
  });
});
