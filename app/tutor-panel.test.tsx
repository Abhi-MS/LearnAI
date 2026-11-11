import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TutorPanel from "./tutor-panel";

afterEach(() => vi.unstubAllGlobals());

function stubTutorFetch(fetchMock: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => url.startsWith("/api/tutor/summary?")
    ? Promise.resolve({ ok: true, json: async () => ({ note: null }) })
    : fetchMock(url, init));
}

const payload = {
  narrative: "Lesson",
  analogies: ["A useful analogy"],
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
  const notice = screen.getByText(/AI responses can be inaccurate or outdated/);
  expect(notice).not.toBeVisible();
  fireEvent.click(screen.getByText("AI & privacy"));
  expect(notice).toBeVisible();
  expect(notice).toHaveTextContent("active conversation are sent to Google Gemini");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(notice).not.toBeVisible();
  expect(onClose).not.toHaveBeenCalled();
  await screen.findByText("Lesson");
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
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
  const plainPayload = { ...payload, analogies: [], visualization_nodes: [], visualization_edges: [] };
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

it("keeps chat usable while a diagram answer is being assessed", async () => {
  let finishAssessment!: (value: { ok: boolean; json: () => Promise<{ correct: boolean; feedback: string }> }) => void;
  const pendingAssessment = new Promise<{ ok: boolean; json: () => Promise<{ correct: boolean; feedback: string }> }>(
    (resolve) => { finishAssessment = resolve; },
  );
  const fetchMock = vi.fn((url: string) => url === "/api/tutor/assess"
    ? pendingAssessment
    : Promise.resolve({ ok: true, json: async () => ({ payload }) }));
  stubTutorFetch(fetchMock);
  render(<TutorPanel topicId="c0a80101-0000-4000-8000-000000000001" topic="Concurrency" level="Beginner" onClose={() => {}} />);
  await screen.findByText("Lesson");
  fireEvent.change(screen.getByLabelText(/Fill in the missing/), { target: { value: "A possible answer" } });
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(screen.getByRole("button", { name: "Checking..." })).toBeDisabled();
  fireEvent.change(screen.getByPlaceholderText("Ask about Concurrency…"), { target: { value: "Can we continue?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  await act(async () => finishAssessment({ ok: true, json: async () => ({ correct: false, feedback: "Try again." }) }));
  expect(screen.getByText("Try again.")).toBeInTheDocument();
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
