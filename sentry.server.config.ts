import * as Sentry from "@sentry/nextjs";
import { sanitizeSentryError } from "./lib/sentry-privacy";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  enabled: Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
  beforeSend: sanitizeSentryError,
  beforeSendTransaction: () => null,
});
