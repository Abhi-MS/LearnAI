export const LEVELS = ["Beginner", "Advanced", "Pro", "Job Ready"] as const;
export type Level = (typeof LEVELS)[number];
