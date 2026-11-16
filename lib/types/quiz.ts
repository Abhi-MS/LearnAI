import { z } from 'zod';
import { LEVELS } from '../levels';

export const levelSchema = z.enum(LEVELS);
export const conceptsSchema = z.array(z.string().trim().min(1).max(200)).length(5)
  .refine((concepts) => new Set(concepts.map((concept) => concept.toLowerCase())).size === 5, 'Concepts must be distinct.');

const questionSchema = z.object({
  conceptIndex: z.number().int().min(0).max(4),
  type: z.enum(['multiple_choice', 'short_answer']),
  prompt: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(250)).max(4),
  answer: z.string().trim().min(1).max(500),
  explanation: z.string().trim().min(1).max(500),
}).strict().superRefine((question, context) => {
  if (question.type === 'multiple_choice') {
    if (question.options.length !== 4 || new Set(question.options).size !== 4 || !question.options.includes(question.answer)) {
      context.addIssue({ code: 'custom', message: 'Multiple-choice questions require four distinct options and a matching answer.' });
    }
  } else if (question.options.length !== 0) {
    context.addIssue({ code: 'custom', message: 'Short-answer questions cannot have options.' });
  }
});

export const quizQuestionsSchema = z.array(questionSchema).length(5).superRefine((questions, context) => {
  if (questions.filter((question) => question.type === 'multiple_choice').length !== 3 ||
      new Set(questions.map((question) => question.conceptIndex)).size !== 5) {
    context.addIssue({ code: 'custom', message: 'A quiz must cover all five concepts with three multiple-choice and two short-answer questions.' });
  }
});
export type QuizQuestions = z.infer<typeof quizQuestionsSchema>;

export const quizAnswersSchema = z.array(z.string().trim().min(1).max(500)).length(5);

export const quizGradesSchema = z.array(z.object({
  questionIndex: z.number().int().min(0).max(4),
  correct: z.boolean(),
  feedback: z.string().trim().min(1).max(500),
}).strict()).length(5).refine((grades) => new Set(grades.map((grade) => grade.questionIndex)).size === 5);
export type QuizGrades = z.infer<typeof quizGradesSchema>;

export const quizResultSchema = z.object({
  correct: z.number().int().min(0).max(5),
  total: z.literal(5),
  passed: z.boolean(),
  level: levelSchema,
  completed: z.boolean(),
  grades: quizGradesSchema,
}).strict();
export type QuizResult = z.infer<typeof quizResultSchema>;
