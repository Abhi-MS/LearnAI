# LearnAI

LearnAI helps people explore a subject or industry with an AI tutor. On first sign-in, learners describe their goal and receive three personal categories, each with starter topics. They can add their own topics and categories, or delete a category and its topics after confirmation.

## Progress log

- Session 1 — scaffolded the project blueprint, baseline README, and CI-ready Next.js + TypeScript foundation; marked M1 as complete.
- Session 2 — fixed the React/Vitest JSX runtime issue by importing React in the test and revalidated the lint + test pipeline.
- Session 3 — defined the core Postgres schema for tracks, users, topics, sessions, quiz results, and concept gaps, and added the migration baseline for M2.
- Session 4 — added the Supabase environment template, shared DB client helper, and a health-check route that verifies the database is reachable before the app goes further into auth/profile work.

## Getting started

1. Install dependencies with `npm install`.
2. Run the app locally with `npm run dev`.
3. Run lint and tests with `npm run lint` and `npm run test -- --run`.

Apply the SQL migrations in `db/migrations` in order to the Supabase database.
Migrations 003 through 005 are required for personal topics, onboarding, and multiple explorations and reference Supabase's `auth.users`. Migration 004 preserves existing custom topics and creates their categories; migration 005 moves an existing plan into its first exploration. Existing users who have not yet onboarded will be asked to set up a learning plan, and their existing topics will be included.
Migration 007 is required for tutoring: it stores each user's last successful follow-up time per topic, across their explorations. A topic becomes eligible for recall after the tutor successfully answers a follow-up; opening a lesson alone does not count. Removing a topic also removes its study-history entry.
Signed-in users can add private topics under an existing category or create a new
category; these topics follow their account across devices. The app requires `GEMINI_API_KEY` for plan generation and tutoring. Generation is limited to five attempts per user and 100 total per day per server process; these limits reset on process restart.

Use the **Currently exploring** dropdown to switch between private learning areas or add another. Each area has its own generated categories and topics; switching is saved to the account.

The tutor introduces a topic with an explanation and question, using examples, analogies, and interactive diagrams when helpful. Select diagram nodes to explore them. Follow-up questions include the active conversation as context; it is discarded when the topic closes and is not saved as chat history. Conversations exceeding 60,000 characters of structured history must be restarted.

When a diagram appears, a node or connection is hidden for an optional retrieval exercise. Check an answer or reveal it; chat remains available. Each check sends an additional request to Gemini and shares the tutor's daily request limits (by default, 30 per user and 100 total per server process, resetting at UTC midnight or process restart). Gemini's own usage limits are separate. For a follow-up question, Gemini checks up to 50 of the most recently studied different topic names for a direct, meaningful relationship to that question. A related topic may prompt one recall checkpoint per session; unrelated or ambiguous questions should not. This relevance judgment uses the existing tutor request and can be imperfect. These exercises do not change topic levels.

## Privacy and database security

Learning goals, topic names, active tutor conversations, diagram details, and submitted diagram answers are sent to Google Gemini. For recall relevance, up to 50 recently studied topic names are sent with follow-up requests until a checkpoint is shown. Study history stores topic IDs and last-studied times, not conversations or assessment results. Do not enter sensitive or confidential information. Review the Google project's data-handling terms and settings before sharing the app.

AI tutor responses can be inaccurate or outdated, especially for new technologies. Verify important details against reliable, current sources.

Supabase database connections require certificate and hostname verification. Node's trusted certificate authorities are used by default. If your Supabase connection requires a separate CA, download it from Supabase Dashboard > Database Settings > SSL Configuration, and set `SUPABASE_DB_CA_CERT` to its PEM contents (newlines or `\n`) in each deployment environment. Do not disable certificate verification. Check `/api/health/db` after deployment.

Sentry error events are reduced to a generic error without the original message, request, user, breadcrumbs, or stack trace. Performance tracing is disabled. This limits diagnostics and does not change Sentry or Google account settings or remove historical data already sent to them.

## Roadmap

See [BLUEPRINT.md](BLUEPRINT.md) for the full milestone plan and design rules.

## MCP server


pm run mcp starts a read-only stdio MCP server (tools: `list_tracks`, `list_topics`) backed by the same Postgres data as the app. Tool calls are capped per day via `MCP_DAILY_CALL_LIMIT` (default 500), and `list_topics` returns at most 25 topics per call. Example client config: `{ \"command\": \"npx\", \"args\": [\"tsx\", \"mcp/index.ts\"], \"cwd\": \"<repo path>\" }`.
