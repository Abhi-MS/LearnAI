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
Signed-in users can add private topics under an existing category or create a new
category; these topics follow their account across devices. The app requires `GEMINI_API_KEY` for plan generation and tutoring. Generation is limited to five attempts per user and 100 total per day per server process; these limits reset on process restart.

Use the **Currently exploring** dropdown to switch between private learning areas or add another. Each area has its own generated categories and topics; switching is saved to the account.

## Roadmap

See [BLUEPRINT.md](BLUEPRINT.md) for the full milestone plan and design rules.

## MCP server


pm run mcp starts a read-only stdio MCP server (tools: `list_tracks`, `list_topics`) backed by the same Postgres data as the app. Tool calls are capped per day via `MCP_DAILY_CALL_LIMIT` (default 500), and `list_topics` returns at most 25 topics per call. Example client config: `{ \"command\": \"npx\", \"args\": [\"tsx\", \"mcp/index.ts\"], \"cwd\": \"<repo path>\" }`.
