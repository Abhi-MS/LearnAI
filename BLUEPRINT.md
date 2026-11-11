# LearnAI Blueprint

## Concept

LearnAI is an on-demand learning companion for developers who use AI tools and want to understand the foundations behind their work. A learner can explore a topic just in time for a real project or learn at their own pace in spare moments. The tutor combines explanations, diagrams, Socratic questions, and examples relevant to the learner's situation. Assessments check understanding using evidence rather than impressions of conversational quality.

## Design rules

1. Progress is computed from logged evidence (quiz results, missed concepts), never from the LLM's opinion of the user.
2. Quiz answers must be validated by a second-pass check before they can gate progress.
3. Start with one Socratic tutor/orchestrator. Add the background assessor only after the core tutoring loop works; it can validate retrieval tasks and suggest quizzes, but does not independently define mastery or promote a learner.
4. Expose learner state as tools so the tutor can call them explicitly: `get_progress`, `record_quiz_result`, and `generate_quiz`.
5. Keep learning sessions flexible and interruptible, without a prescribed duration.
6. Avoid claiming mastery from conversational quality; use measured outcomes from quiz performance and recurring concept gaps.
7. AI explanations can be inaccurate or outdated, especially for new technologies. Encourage learners to verify important claims against reliable, current sources.

## Roadmap / Milestone Plan

The current app foundation includes sign-in, personal learning plans, topic selection and custom topics, and Gemini-backed tutoring. After the baseline database setup and Session 4 health check, Session 5 starts the next planned milestone.

### Milestone 3: Socratic Core & Structured AI Orchestration Engine

- [ ] **Gemini JSON Schema Enforcement:** Use the Gemini SDK's `responseSchema` configuration for structured responses. Add `lib/types/socratic.ts` with strong interfaces for `SocraticPayload`, including analogies, narrative text, Socratic questions, and graph arrays named `visualization_nodes` and `visualization_edges`.
- [ ] **UI Graphic Mapping Component:** Build an `app/` view that accepts the graph arrays and renders them as an interactive node graph using SVG coordinates or HTML/CSS blocks, rather than text blocks.
- [ ] **Socratic Conversation:** Start a topic with an explanation, visual diagram, and thought-provoking question. Preserve conversation context during the active chat so follow-up answers can use earlier messages and the learner's real-world examples.
- [ ] **Current Sources:** Plan a way to reference reliable, current sources for fast-changing technologies, and communicate uncertainty rather than implying AI answers are guaranteed accurate.

### Milestone 4: Cognitive Science Integration & Assessment Workers

- [ ] **The Broken Diagram Test (Active Retrieval):** Randomly remove a crucial node or edge label from a validated visual graph. Ask the learner to fill in the blank or complete a micro-challenge, then validate the response with the background assessor.
- [ ] **Contextual Interleaving Hooks:** Query past topics from the `concepts` data tables and inject historical-recall checkpoints into current chat loops. Add or adapt the topic-history schema if it is not available in the baseline database.

### Milestone 5: Stateless Session Termination & Summary Sync

- [ ] **Memory Optimization Directive:** Do not store long, verbose multi-turn chat streams in Postgres/Supabase; persist only the minimal session state and summary needed to resume learning.
- [ ] **Session Teardown Hook:** On explicit chat closure or topic exit, call a cleanup API that asks Gemini to summarize the conversation stream into a small structured payload containing:
  1. A short Markdown note describing the main breakthroughs.
  2. Enum or numerical evaluation markers for conceptual depth. These markers are descriptive and must not independently gate progress.
  3. A structural pointer/next-step string specifying where the dialogue should resume when the learner returns to the topic.
- [ ] **Database Sync:** Add or adapt the `topic_sessions` schema and persist the lightweight summary payload there. Treat cleanup on window unmount as best-effort; do not rely on it as the only persistence trigger.
- [ ] **Topic Notes and Resume:** Let learners view the saved summary for a topic. Discard the full conversation context after the chat is disposed, and provide the saved summary and resume pointer as context when the learner returns.

### Milestone 6: Assessment & Evidence-Based Progress

- [ ] **Quiz Planning and Readiness:** When a learner starts a topic, have the observing agent plan a structured quiz for their current level and the concepts it covers. Track which concepts the conversation has covered, including relevant advanced material, and let the agent suggest the quiz when it judges the learner ready. This judgment is a prompt, not proof of mastery.
- [ ] **Learner-Led Conversation:** Use the planned concepts to guide the tutor when appropriate, but prioritize the learner's questions and follow their interests, even when they lead to more advanced material. Quiz suggestions must be optional so the learner can defer and continue chatting.
- [ ] **Validated Promotion:** Validate quiz answers with a second-pass check. Promote the learner to the next level for that topic when their validated score is at least 80% correct; otherwise keep their current level. Record quiz results and recurring concept gaps as evidence.
- [ ] **Visible Progress:** Show each topic's current level and update its level badge and dashboard checkmarks from logged assessment outcomes, not conversational quality or summary evaluation markers.

### Milestone 7: Evaluation Set

- [ ] Build a 30-question evaluation set and report accuracy in the README.

### Milestone 8: Deployment

- [ ] Deploy to Azure with IaC (Bicep or Terraform) and CI/CD.

### Milestone 9: Stretch Goals

- [ ] Add more tracks.

## Notes for the implementation plan

- Keep the first delivery focused on the loop: track selection, topic, a single tutor, structured quiz generation, validation, and evidence-based progress.
- Add the background assessor only after the Socratic tutoring loop is working; it validates retrieval challenges and can suggest quizzes, while validated quiz outcomes determine level progression.
- Use explicit tool calls for learner-state access so the tutor remains auditable and the app remains truthful about what is actually measured.
- The baseline migrations define `sessions` and `concept_gaps`, but not `concepts` or `topic_sessions`; add or adapt those tables as part of Milestones 4 and 5 rather than assuming they already exist.
