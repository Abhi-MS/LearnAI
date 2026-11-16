import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TutorPanel from "./tutor-panel";

vi.mock("./quiz-panel", () => ({ default: () => null }));
afterEach(() => vi.unstubAllGlobals());

function stubTutorFetch(fetchMock: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => url.startsWith("/api/tutor/summary?")
    ? Promise.resolve({ ok: true, json: async () => ({ note: null }) })
    : fetchMock(url, init));
}

const payload = {
  narrative: "Lesson",
  analogies: ["A useful analogy"],
  conversation_question: "Where could this idea take us next?",
  socratic_questions: ["What comes next?"],
  visualization_nodes: [
    { id: "a", label: "Start", description: "The starting point" },
    { id: "b", label: "Finish", description: "The end point" },
  ],
  visualization_edges: [{ source: "a", target: "b", label: "leads to" }],
};

it("keeps the disclaimer accessible without occupying chat space", async () => {
  stubTutorFetch(vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ payload }),
  }));
  const onClose = vi.fn();
  render(<TutorPanel topicId="c0a80101-0000-4000-8000-000000000001" topic="Concurrency" level="Beginner" onClose={onClose} />);
  const notice = screen.getByText(/AI responses and grading can be inaccurate or outdated/);
  expect(notice).not.toBeVisible();
  fireEvent.click(screen.getByText("AI & privacy"));
  expect(notice).toBeVisible();
  expect(notice).toHaveTextContent("active conversation, quiz questions and answers are sent to Google Gemini");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(notice).not.toBeVisible();
  expect(onClose).not.toHaveBeenCalled();
  await screen.findByText("Lesson");
  expect(screen.getByText(payload.conversation_question).closest(".bubble")?.lastElementChild).toHaveTextContent(payload.conversation_question);
  expect(screen.getByText(/Start → Finish: leads to/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(screen.getByText(/The starting point/)).toBeInTheDocument();
});

it("sends the active conversation when the learner asks a follow-up", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ payload }) });
  stubTutorFetch(fetchMock);
  render(<TutorPanel topicId="c0a80101-0000-4000-8000-000000000001" topic="Concurrency" level="Beginner" onClose={() => {}} />);
  await screen.findByText("Lesson");
  fireEvent.change(screen.getByPlaceholderText("Ask about Concurrency…"), { target: { value: "How does that work?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const body = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(body.topicId).toBe("c0a80101-0000-4000-8000-000000000001");
  expect(body.question).toBe("How does that work?");
  expect(body.history).toEqual([{ role: "tutor", payload }]);
  await waitFor(() => expect(screen.getAllByText("Lesson")).toHaveLength(2));
  expect(screen.getAllByText(payload.conversation_question)).toHaveLength(2);
  fireEvent.change(screen.getByPlaceholderText("Ask about Concurrency…"), { target: { value: "And then?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(JSON.parse(fetchMock.mock.calls[2][1].body).history).toEqual([
    { role: "tutor", payload },
    { role: "user", text: "How does that work?" },
    { role: "tutor", payload },
  ]);
  await waitFor(() => expect(screen.getAllByText("Lesson")).toHaveLength(3));
});

it("renders a reply without a diagram or analogy and keeps it in conversation context", async () => {
  const plainPayload = { ...payload, analogies: [], socratic_questions: [], visualization_nodes: [], visualization_edges: [] };
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ payload: plainPayload }) });
  stubTutorFetch(fetchMock);
  render(<TutorPanel topicId="c0a80101-0000-4000-8000-000000000001" topic="Concurrency" level="Beginner" onClose={() => {}} />);
  await screen.findByText("Lesson");
  expect(screen.queryByText(/Concept diagram/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Fill in the missing/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Analogy:/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Tell me more" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).history).toEqual([{ role: "tutor", payload: plainPayload }]);
  await waitFor(() => expect(screen.getAllByText("Lesson")).toHaveLength(2));
});

it("keeps a failed question in context when the learner asks to retry", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ payload }) })
    .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "Tutor unavailable" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ payload }) });
  stubTutorFetch(fetchMock);
  render(<TutorPanel topicId="c0a80101-0000-4000-8000-000000000001" topic="Concurrency" level="Beginner" onClose={() => {}} />);
  await screen.findByText("Lesson");
  fireEvent.change(screen.getByPlaceholderText("Ask about Concurrency…"), { target: { value: "How do threads share memory?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Tutor unavailable");
  fireEvent.change(screen.getByPlaceholderText("Ask about Concurrency…"), { target: { value: "Try again" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  const retry = JSON.parse(fetchMock.mock.calls[2][1].body);
  expect(retry.question).toBe("Try again");
  expect(retry.history).toEqual([
    { role: "tutor", payload },
    { role: "user", text: "How do threads share memory?" },
  ]);
  await waitFor(() => expect(screen.getAllByText("Lesson")).toHaveLength(2));
});
