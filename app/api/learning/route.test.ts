import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, clientQuery, getUser, generate, ensureCategory, captureException } = vi.hoisted(() => ({
  query: vi.fn(), clientQuery: vi.fn(), getUser: vi.fn(), generate: vi.fn(),
  ensureCategory: vi.fn(), captureException: vi.fn(),
}));
vi.mock('../../../lib/db', () => ({ getPool: () => ({ query }) }));
vi.mock('../../../lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock('../../../lib/learning-generation', () => ({ generateLearningCategories: generate }));
vi.mock('../../../lib/learning', () => ({
  withUserLearningTransaction: async (_userId: string, work: (client: { query: typeof clientQuery }) => Promise<unknown>) => work({ query: clientQuery }),
  ensureCategory,
}));
vi.mock('@sentry/nextjs', () => ({ captureException }));

import { GET, POST, PATCH } from './route';

const request = (goal: unknown) => new Request('http://localhost/api/learning', {
  method: 'POST', body: JSON.stringify({ goal }),
});

describe('/api/learning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('requires authentication for reads and generation', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
    expect((await POST(request('Music'))).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns only the authenticated user plan', async () => {
    query.mockResolvedValue({ rows: [{ activeAreaId: 'area', areas: [] }] });
    const response = await GET();
    expect(await response.json()).toEqual({ activeAreaId: 'area', areas: [] });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('a.user_id = $1'), ['user-1']);
  });

  it.each(['', ' '.repeat(2), 'a'.repeat(201), 123])('rejects invalid goals', async (goal) => {
    expect((await POST(request(goal))).status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it('creates three generated categories and their topics without deleting existing ones', async () => {
    query.mockResolvedValue({ rows: [] });
    clientQuery.mockResolvedValue({ rows: [{ id: 'area-1' }] });
    ensureCategory.mockImplementation(async (_client, _id, _areaId, name) => ({ id: name, name }));
    generate.mockResolvedValue([
      { name: 'A', topics: ['A1', 'A2'] },
      { name: 'B', topics: ['B1', 'B2'] },
      { name: 'C', topics: ['C1', 'C2'] },
    ]);
    expect((await POST(request(' Music '))).status).toBe(201);
    expect(generate).toHaveBeenCalledWith('Music');
    expect(ensureCategory).toHaveBeenCalledTimes(3);
    expect(clientQuery).toHaveBeenCalledTimes(9);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO custom_topics'), ['user-1', 'A', 'A', 'A1']);
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes('DELETE'))).toBe(false);
  });

  it('does not overwrite an existing plan', async () => {
    query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    expect((await POST(request('Music'))).status).toBe(409);
    expect(generate).not.toHaveBeenCalled();
  });

  it('returns a retryable error when generation fails', async () => {
    query.mockResolvedValue({ rows: [] });
    generate.mockRejectedValue(new Error('model failure'));
    const response = await POST(request('Music'));
    expect(response.status).toBe(503);
    expect(clientQuery).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();
  });

  it('only switches to an area belonging to the signed-in user', async () => {
    const areaId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const request = () => new Request('http://localhost/api/learning', { method: 'PATCH', body: JSON.stringify({ areaId }) });
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ active_area_id: areaId }] });
    expect((await PATCH(request())).status).toBe(404);
    expect((await PATCH(request())).status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('user_id = $2'), [areaId, 'user-1']);
  });
});
