import { describe, expect, it, vi } from 'vitest';

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
  })),
}));

describe('GET /api/health/db', () => {
  it('returns a healthy database status when the connection succeeds', async () => {
    process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/test';

    const { GET } = await import('./route');
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, database: 'supabase' });
  });
});
