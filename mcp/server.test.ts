import { describe, expect, it } from 'vitest';
import { createDailyLimiter } from './server';

describe('createDailyLimiter', () => {
  it('blocks calls past the limit and resets the next day', () => {
    let now = new Date('2026-11-02T10:00:00Z');
    const consume = createDailyLimiter(2, () => now);

    expect(consume()).toBe(true);
    expect(consume()).toBe(true);
    expect(consume()).toBe(false);

    now = new Date('2026-11-03T00:00:01Z');
    expect(consume()).toBe(true);
  });
});
