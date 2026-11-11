import { z } from 'zod';

const nodeSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(300),
}).strict();

const edgeSchema = z.object({
  source: z.string().trim().min(1).max(40),
  target: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(60),
}).strict();

export const socraticPayloadSchema = z.object({
  narrative: z.string().trim().min(1).max(4000),
  analogies: z.array(z.string().trim().min(1).max(500)).max(2),
  socratic_questions: z.array(z.string().trim().min(1).max(500)).min(1).max(2),
  visualization_nodes: z.array(nodeSchema).max(6),
  visualization_edges: z.array(edgeSchema).max(8),
}).strict().superRefine((payload, context) => {
  const { visualization_nodes: nodes, visualization_edges: edges } = payload;
  if ((nodes.length > 0 || edges.length > 0) && (nodes.length < 2 || edges.length < 1)) {
    context.addIssue({ code: 'custom', message: 'A diagram must have at least two nodes and one edge.' });
  }
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) {
    context.addIssue({ code: 'custom', message: 'Graph node IDs must be unique.' });
  }
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target) {
      context.addIssue({ code: 'custom', message: 'Graph edges must connect distinct existing nodes.' });
    }
  }
});

export type SocraticPayload = z.infer<typeof socraticPayloadSchema>;

export const diagramAssessmentSchema = z.object({
  correct: z.boolean(),
  feedback: z.string().trim().min(1).max(400),
}).strict();

export const tutorHistorySchema = z.array(z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), text: z.string().trim().min(1).max(500) }).strict(),
  z.object({ role: z.literal('tutor'), payload: socraticPayloadSchema }).strict(),
]));

export type TutorHistory = z.infer<typeof tutorHistorySchema>;
