import { savedTopicNoteSchema } from "./types/topic-note";

export async function fetchTopicNote(topicId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/tutor/summary?topicId=${encodeURIComponent(topicId)}`, {
    cache: "no-store",
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not load your topic note.");
  const parsed = savedTopicNoteSchema.nullable().safeParse(data?.note);
  if (!parsed.success) throw new Error("The topic note could not be displayed. Please try again.");
  return parsed.data;
}
