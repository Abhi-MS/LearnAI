import { z } from 'zod';

export const topicNoteSchema = z.object({
  note: z.string().trim().min(1).max(3000),
  depth: z.enum(['unclear', 'introductory', 'developing', 'detailed']),
  nextStep: z.string().trim().min(1).max(500),
}).strict();

export const savedTopicNoteSchema = topicNoteSchema.extend({
  revision: z.number().int().positive(),
});

export type TopicNote = z.infer<typeof topicNoteSchema>;
export type SavedTopicNote = z.infer<typeof savedTopicNoteSchema>;
