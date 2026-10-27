# LearnAI Blueprint

## Concept

LearnAI is a daily learning app for developers who rely on AI tools and want to rebuild their fundamentals. The app helps a learner select a track such as frontend, backend, or devops, choose a topic from a curated list or a custom topic they are currently solving at work, and then work through a short, guided tutoring session. The AI tutor adapts to the learner's level and keeps the session focused on concrete concepts, examples, and practice. At the end of each session, the learner completes a short interview-style quiz that checks understanding in a way that is grounded in evidence.

## Design rules

1. Progress is computed from logged evidence (quiz results, missed concepts), never from the LLM's opinion of the user.
2. Quiz answers must be validated by a second-pass check before they can gate progress.
3. Start with one tutor agent. Add a background evaluator only after the core loop works, and document the reason.
4. Expose learner state as tools so the tutor can call them explicitly: `get_progress`, `record_quiz_result`, and `generate_quiz`.
5. The learner experience should stay small, fast, and realistic for 10-15 minute daily practice sessions.
6. Avoid claiming mastery from conversational quality; use measured outcomes from quiz performance and recurring concept gaps.

## Milestone checklist

- [x] M1 Scaffold + CI
- [ ] M2 Data model (users, tracks, topics, sessions, quiz results) + migrations
- [ ] M3 Auth + profile (track selection)
- [ ] M4 Topic picker + custom topic input
- [ ] M5 Tutor chat (streaming, level-aware system prompt)
- [ ] M6 Quiz generation (structured JSON output) + validation pass
- [ ] M7 Scoring + dashboard checkmarks
- [ ] M8 Tiny eval set (30 Q&A) with accuracy reported in README
- [ ] M9 Deploy to Azure with IaC (Bicep or Terraform) + CI/CD
- [ ] M10 Stretch: background evaluator, more tracks, level progression

## Notes for the implementation plan

- Keep the first delivery focused on the loop: track selection, topic, a single tutor, structured quiz generation, validation, and evidence-based progress.
- Add a background evaluator only after the baseline flow is working; the evaluator should be a monitoring layer, not the primary source of learner progress.
- Use explicit tool calls for learner-state access so the tutor remains auditable and the app remains truthful about what is actually measured.
