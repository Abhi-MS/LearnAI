import { describe, expect, it } from 'vitest';
import { sanitizeSentryError } from './sentry-privacy';

describe('sanitizeSentryError', () => {
  it('removes user data from exception messages and event metadata', () => {
    const result = sanitizeSentryError({
      type: undefined,
      event_id: 'event-1',
      message: 'private learning goal',
      user: { email: 'person@example.test' },
      request: { url: 'https://example.test/?token=secret', data: 'private question' },
      breadcrumbs: [{ message: 'private topic' }],
      extra: { token: 'secret' },
      exception: { values: [{ type: 'Error', value: 'private question', stacktrace: { frames: [{ filename: '/private/path' }] } }] },
    });
    expect(result).toEqual({
      type: undefined,
      event_id: 'event-1',
      timestamp: undefined,
      platform: undefined,
      level: undefined,
      exception: { values: [{ type: 'ApplicationError', value: 'An application error occurred.' }] },
    });
    expect(JSON.stringify(result)).not.toMatch(/private|secret|example/);
  });
});
