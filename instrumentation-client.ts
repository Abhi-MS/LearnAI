import * as Sentry from "@sentry/nextjs";
import { sanitizeSentryError } from "./lib/sentry-privacy";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  beforeSend: sanitizeSentryError,
  beforeSendTransaction: () => null,
  tracesSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
