import type { ErrorEvent } from '@sentry/nextjs';

export function sanitizeSentryError(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    exception: {
      values: [{
        type: 'ApplicationError',
        value: 'An application error occurred.',
      }],
    },
  };
}
