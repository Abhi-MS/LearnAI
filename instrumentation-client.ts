import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  // 100% in dev, 10% in production unless overridden
  tracesSampleRate: Number(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ??
      (process.env.NODE_ENV === "development" ? 1.0 : 0.1),
  ),
  // Outgoing requests to these targets get sentry-trace/baggage headers for distributed tracing
  tracePropagationTargets: ["localhost", /^\//, /^https:\/\/[^/]*\.supabase\.co/],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
