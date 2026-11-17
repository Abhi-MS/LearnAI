# Database notes

LearnAI uses Supabase Auth and Postgres. The migrations create the app schema, move the original curated learning model toward personal learning plans, and add topic notes and evidence-based assessment.

## Apply migrations

For a new database, apply the SQL files in [`migrations`](migrations) in numeric order, from `001` through `009`. For a database that already has some migrations, apply only the unapplied migrations, in order. The migrations build on Supabase's `auth.users` table.

| Migration | Purpose |
| --- | --- |
| `001` | Initial schema for curated tracks, topics, sessions, quiz results, and concept gaps. |
| `002` | Seed the initial tracks and topics. |
| `003` | Add custom topics and learning profiles. |
| `004` | Add generated learning categories and migrate existing custom topics into categories. |
| `005` | Add multiple personal learning areas and move existing plans into an area. |
| `006` | Restrict access to legacy user tables. |
| `007` | Track successful topic study for contextual recall. |
| `008` | Store one private rolling note per topic. |
| `009` | Add topic levels, quiz plans and attempts, validated results, and concept gaps. |

Migrations `004` and `005` preserve existing learner data while moving it into the newer category and exploration model. Review each migration before applying it to a database with existing data.

## Current learning data

- **Learning plan:** personal explorations, categories, and custom topics.
- **Continuity:** last-studied timestamps and one rolling note per topic; full chat transcripts are not stored.
- **Progress:** current level and completion state, quiz plans and attempts, validated results, and missed concepts.

The original `tracks`, `topics`, `sessions`, `quiz_results`, and `concept_gaps` tables are part of the baseline schema. The current personal-topic learning and assessment flow uses the newer account-scoped tables described above.

## Privacy and integrity

Learner-owned tables reference Supabase Auth identities and use row-level security with direct client privileges restricted. App access is performed through server-side database operations that scope reads and writes to the authenticated user. Foreign keys keep topic notes, progress, and quiz data tied to their owner and topic; deleting a topic cascades its dependent learning data.

Progress changes only after quiz answers pass the server-side validation checks. Topic-note depth is descriptive and does not determine a learner's level.

For application setup and the full privacy overview, see the [README](../README.md).
