# LearnAI database model

This milestone defines the core persisted state for the daily learning loop.

## Core entities

- `tracks`: fixed learning domains such as frontend, backend, and devops.
- `users`: learner identity and current profile preferences.
- `topics`: curated or custom learning topics inside a given track.
- `sessions`: a single learning interaction that starts with a topic and ends with a quiz.
- `quiz_results`: captured quiz evidence used to determine pass/fail and progress.
- `concept_gaps`: explicit concept misses that serve as evidence for improvement and level progression.

## Progress rules

- Progress must be derived from stored session and quiz records.
- `quiz_results.validation_passed` must be true before a result can unlock progress.
- `concept_gaps` provides concrete evidence of weak areas rather than relying on raw chat sentiment.

## Migration note

The schema is created from `db/migrations/001_init_schema.sql` and should be treated as the baseline for the next feature work.
