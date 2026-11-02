import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  // 100% in dev, 10% in production unless overridden
  tracesSampleRate: Number(
    process.env.SENTRY_TRACES_SAMPLE_RATE ??
      (process.env.NODE_ENV === "development" ? 1.0 : 0.1),
  ),
  enabled: Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
});
