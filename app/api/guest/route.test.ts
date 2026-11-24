import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, getUser, captureException } = vi.hoisted(() => ({
  query: vi.fn(), getUser: vi.fn(), captureException: vi.fn(),
}));
vi.mock('../../../lib/db', () => ({ getPool: () => ({ query }) }));
vi.mock('../../../lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException }));

import { DELETE, POST } from './route';

const request = (method: string, origin = 'http://localhost') => new Request('http://localhost/api/guest', {
  method, headers: { origin },
});

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'guest-1', is_anonymous: true } } });
  query.mockResolvedValue({ rowCount: 1 });
});

describe('/api/guest', () => {
  it('rejects cross-origin and unauthenticated deletion', async () => {
    expect((await DELETE(request('DELETE', 'https://other.example'))).status).toBe(403);
    getUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await DELETE(request('DELETE'))).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('deletes only the authenticated user if still anonymous', async () => {
    expect((await DELETE(request('DELETE'))).status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('id = $1 AND is_anonymous IS TRUE'), ['guest-1']);
    query.mockResolvedValueOnce({ rowCount: 0 });
    expect((await DELETE(request('DELETE'))).status).toBe(409);
    getUser.mockResolvedValueOnce({ data: { user: { id: 'permanent', is_anonymous: false } } });
    expect((await DELETE(request('DELETE'))).status).toBe(403);
  });

  it('records activity only for a still-anonymous account', async () => {
    expect((await POST(request('POST'))).status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('is_anonymous IS TRUE FOR UPDATE'), ['guest-1']);
    query.mockResolvedValueOnce({ rowCount: 0 });
    expect((await POST(request('POST'))).status).toBe(409);
    getUser.mockResolvedValueOnce({ data: { user: { id: 'permanent', is_anonymous: false } } });
    expect((await POST(request('POST'))).status).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not report success when deletion fails', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await DELETE(request('DELETE'))).status).toBe(503);
    expect(captureException).toHaveBeenCalledOnce();
  });
});
