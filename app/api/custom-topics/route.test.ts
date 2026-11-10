import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, getUser, captureException } = vi.hoisted(() => ({
  query: vi.fn(),
  getUser: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('../../../lib/db', () => ({ getPool: () => ({ query }) }));
vi.mock('../../../lib/learning', () => ({
  withUserLearningTransaction: async (_userId: string, work: (client: { query: typeof query }) => Promise<unknown>) => work({ query }),
  ensureCategory: async (_client: unknown, _userId: string, _areaId: string, name: string) => ({ id: 'category-1', name }),
}));
vi.mock('../../../lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException }));

import { GET, POST } from './route';

const areaId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
function request(body: unknown) {
  return new Request('http://localhost/api/custom-topics', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/custom-topics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('requires authentication for reads and writes', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
    expect((await POST(request({ title: 'Topic', category: 'Backend' }))).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('only reads topics belonging to the signed-in user', async () => {
    query.mockResolvedValue({ rows: [{ id: '1', title: 'Topic', category: 'Backend' }] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = $1'), ['user-1']);
    expect(await response.json()).toEqual({ topics: [{ id: '1', title: 'Topic', category: 'Backend' }] });
  });

  it('saves trimmed values using the authenticated user', async () => {
    const topic = { id: '1', title: 'Queues', category: 'Architecture' };
    query.mockResolvedValueOnce({ rows: [{ id: areaId }] }).mockResolvedValueOnce({ rows: [topic] });
    const response = await POST(request({ title: ' Queues ', category: ' Architecture ', areaId, userId: 'other' }));
    expect(response.status).toBe(201);
    expect(query).toHaveBeenCalledWith(expect.any(String), ['user-1', 'category-1', 'Architecture', 'Queues']);
    expect(await response.json()).toEqual({ topic, category: { id: 'category-1', name: 'Architecture' } });
  });

  it.each([
    { title: ' ', category: 'Backend' },
    { title: 'a'.repeat(121), category: 'Backend' },
    { title: 'Topic', category: 'b'.repeat(81) },
    { title: 'Topic', category: '' },
  ])('rejects invalid input', async (body) => {
    expect((await POST(request({ ...body, areaId }))).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('reports duplicates without returning success', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: areaId }] }).mockResolvedValueOnce({ rows: [] });
    expect((await POST(request({ title: 'Topic', category: 'Backend', areaId }))).status).toBe(409);
  });

  it('rejects adding a topic to an area owned by another user', async () => {
    query.mockResolvedValue({ rows: [] });
    expect((await POST(request({ title: 'Topic', category: 'Backend', areaId }))).status).toBe(404);
    expect(query).toHaveBeenCalledOnce();
  });

  it('reports database failures without exposing details', async () => {
    query.mockRejectedValue(new Error('database connection failure'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Custom topics are unavailable.' });
    expect(captureException).toHaveBeenCalled();
  });
});
