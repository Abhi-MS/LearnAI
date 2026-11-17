# LearnAI Product Blueprint

## The idea

People do not learn only by taking courses. They get curious, hit a question at work, change careers, or finally have a few minutes to understand something they have wondered about.

**LearnAI is a personal learning companion for those moments.** A learner chooses the subject and direction; an AI tutor helps make the ideas understandable, follows the learner's questions, and remembers enough to make returning feel natural. Learning can be brief or deep, planned or spontaneous.

The product should feel less like completing a course and more like having a thoughtful tutor available when curiosity strikes.

## The promise

> Learn what matters to you, at your pace, and know what you have actually understood.

LearnAI is not trying to maximize time in the app, enforce a lesson schedule, or infer mastery from confident conversation. It should make it easier to start learning, continue across interruptions, and see progress grounded in evidence.

## Product principles

1. **Learner-led, not syllabus-led.** Give learners a useful starting path, then let them choose topics, ask their own questions, and change direction.
2. **Flexible and interruptible.** Do not require a fixed session length, a streak, or a prescribed order.
3. **Explain before testing.** Teach with clear explanations, relevant examples, and analogies. Use diagrams for concepts that benefit from a visual; do not make a diagram a requirement for every answer.
4. **Keep the conversation inviting.** End explanations with an opening to explore further. Offer a knowledge check only when it is useful for the topic—not after every turn.
5. **Resume without retaining everything.** Keep a concise rolling note and next step per topic, not a permanent transcript of the full conversation.
6. **Make progress honest.** Conversation quality and AI-generated impressions are not evidence of mastery. Use validated assessment outcomes and retain concept gaps as actionable evidence.
7. **Be clear about AI limits.** Generated explanations, questions, and grades can be wrong or out of date. Do not invent citations; learners should verify consequential claims.
8. **Treat learner data carefully.** Explain what is sent to AI providers, store only the state needed for the learning loop, and keep account data private.

## The core learning loop

1. A learner describes an interest, skill, or work goal.
2. LearnAI creates a personal exploration with starter categories and topics.
3. The learner picks a topic and learns through an adaptive explanation and open-ended dialogue.
4. The learner can take an optional quiz to check understanding.
5. Validated quiz evidence updates the topic's level; missed concepts are recorded.
6. When the learner leaves, a short note captures what was covered and where to resume.

## What is implemented

- Google sign-in and private, account-scoped learning data.
- Multiple personal explorations, each with generated categories and starter topics.
- Custom categories and topics, with per-topic learning levels and completion.
- Gemini-backed lessons and follow-up dialogue; diagrams are included when useful, and exploratory questions keep the discussion open.
- Occasional, contextual learning checks and cross-topic recall prompts.
- One rolling topic note, with a summary and next step, used to resume learning.
- Five-question mixed-format quizzes, with two grading checks before a result can affect progress.
- Evidence-based progression across Beginner, Advanced, Pro, and Job Ready levels; a passing Job Ready result marks a topic complete.
- A read-only stdio MCP server for listing tracks and topics.

See the [README](README.md) for setup, privacy, and operational details.

## Roadmap

### 1. Evaluate learning quality

- [ ] Build a representative 30-question evaluation set.
- [ ] Run it against the current tutor and publish the measured accuracy and evaluation method in the README.
- [ ] Use evaluation results to identify weak areas in explanations, questions, quiz generation, and grading.

### 2. Improve source grounding

- [ ] Explore vetted retrieval for fast-changing subjects.
- [ ] Prefer authoritative sources and include attribution and retrieval dates.
- [ ] Verify sources before showing them; communicate uncertainty when trustworthy sources are unavailable.
- [ ] Disclose any additional data shared with a retrieval provider.

### 3. Deploy responsibly

- [ ] Deploy to Azure with infrastructure as code (Bicep or Terraform).
- [ ] Add deployment CI/CD and document required configuration, migrations, and operational checks.

### 4. Grow thoughtfully

- [ ] Add more curated learning tracks if they make the starting experience more useful.
- [ ] Evaluate improvements against learner outcomes and privacy requirements before expanding the product.

## Assessment boundary

The current app uses explicit server-side assessment operations. Model-initiated function calling and a separate background assessor are not implemented. Tutor suggestions can help a learner decide when to quiz, but only validated quiz results update topic levels or completion. Topic-note depth is descriptive and never gates progress.

## Data model notes

The first migrations define the original curated-track schema. The current personal-learning flow uses account-scoped tables for learning areas, categories, custom topics, study history, topic notes, progress, quiz plans, attempts, results, and concept gaps. Apply the migrations in order; see [`db/README.md`](db/README.md).
