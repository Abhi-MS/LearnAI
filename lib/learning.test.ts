import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, release, connect } = vi.hoisted(() => ({
  query: vi.fn(), release: vi.fn(), connect: vi.fn(),
}));
vi.mock('./db', () => ({ getPool: () => ({ connect }) }));
import { withUserLearningTransaction } from './learning';

describe('withUserLearningTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockResolvedValue({ query, release });
    query.mockResolvedValue({ rows: [] });
  });

  it('locks the user and commits before releasing the connection', async () => {
    const result = await withUserLearningTransaction('user-1', async (client) => {
      await client.query('INSERT topic');
      return 'saved';
    });
    expect(result).toBe('saved');
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN', 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', 'INSERT topic', 'COMMIT',
    ]);
    expect(query.mock.calls[1][1]).toEqual(['user-1']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases the connection on a write failure', async () => {
    await expect(withUserLearningTransaction('user-1', async () => {
      throw new Error('write failed');
    })).rejects.toThrow('write failed');
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN', 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', 'ROLLBACK',
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
});
