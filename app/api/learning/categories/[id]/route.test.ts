import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, getUser } = vi.hoisted(() => ({ query: vi.fn(), getUser: vi.fn() }));
vi.mock('../../../../../lib/learning', () => ({
  withUserLearningTransaction: async (_userId: string, work: (client: { query: typeof query }) => Promise<unknown>) => work({ query }),
}));
vi.mock('../../../../../lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
import { DELETE } from './route';

const id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const invoke = (value = id) => DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: value }) });

describe('DELETE category', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('requires authentication and a valid id', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await invoke()).status).toBe(401);
    expect((await invoke('invalid')).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('deletes only the signed-in user category and its topics', async () => {
    query.mockResolvedValueOnce({ rows: [{ name: 'Music' }] }).mockResolvedValue({ rows: [] });
    expect((await invoke()).status).toBe(200);
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('id = $1 AND user_id = $2'), [id, 'user-1']);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('category_id = $2'), ['user-1', id]);
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('DELETE FROM learning_categories'), [id, 'user-1']);
  });

  it('does not delete another user’s category', async () => {
    query.mockResolvedValue({ rows: [] });
    expect((await invoke()).status).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
