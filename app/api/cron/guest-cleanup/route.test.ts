import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../../lib/db', () => ({ getPool: () => ({ query }) }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
import { GET } from './route';

const request = (authorization?: string) => new Request('http://localhost/api/cron/guest-cleanup', {
  headers: authorization ? { authorization } : {},
});

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  query.mockReset().mockResolvedValue({ rowCount: 2 });
});
afterEach(() => vi.unstubAllEnvs());

it('requires the configured secret before touching the database', async () => {
  expect((await GET(request())).status).toBe(401);
  expect((await GET(request('Bearer wrong'))).status).toBe(401);
  vi.stubEnv('CRON_SECRET', '');
  expect((await GET(request('Bearer '))).status).toBe(401);
  expect(query).not.toHaveBeenCalled();
});

it('only selects inactive anonymous accounts in locked batches', async () => {
  const response = await GET(request('Bearer test-secret'));
  expect(await response.json()).toEqual({ deleted: 2 });
  expect(query).toHaveBeenCalledWith(expect.stringContaining("INTERVAL '30 days'"));
  expect(query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE OF u SKIP LOCKED'));
  expect(query).toHaveBeenCalledWith(expect.stringContaining('u.is_anonymous IS TRUE'));
});
