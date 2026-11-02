import { describe, expect, it, vi } from 'vitest';

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({
      rows: [
        { track_slug: 'backend', track_name: 'Backend', title: 'Database indexing', slug: 'database-indexing' },
        { track_slug: 'backend', track_name: 'Backend', title: 'Idempotent APIs', slug: 'idempotent-apis' },
      ],
    }),
  })),
}));

describe('GET /api/topics', () => {
  it('returns topics from the database grouped by track', async () => {
    process.env.DATABASE_URL = 'postgres://localhost:5432/test';

    const { GET } = await import('./route');
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tracks: [
        {
          slug: 'backend',
          name: 'Backend',
          topics: [
            { slug: 'database-indexing', title: 'Database indexing' },
            { slug: 'idempotent-apis', title: 'Idempotent APIs' },
          ],
        },
      ],
    });
  });
});
