import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TutorPanel from "./tutor-panel";

afterEach(() => vi.unstubAllGlobals());

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
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ payload }),
  }));
  const onClose = vi.fn();
  render(<TutorPanel topic="Concurrency" level="Beginner" onClose={onClose} />);
  const notice = screen.getByText(/AI responses can be inaccurate or outdated/);
  expect(notice).not.toBeVisible();
  fireEvent.click(screen.getByText("AI & privacy"));
  expect(notice).toBeVisible();
  expect(notice).toHaveTextContent("active conversation are sent to Google Gemini");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(notice).not.toBeVisible();
  expect(onClose).not.toHaveBeenCalled();
  await screen.findByText("Lesson");
  expect(screen.getByText(/Start → Finish: leads to/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(screen.getByText(/The starting point/)).toBeInTheDocument();
});

it("sends the active conversation when the learner asks a follow-up", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ payload }) });
  vi.stubGlobal("fetch", fetchMock);
  render(<TutorPanel topic="Concurrency" level="Beginner" onClose={() => {}} />);
  await screen.findByText("Lesson");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "How does that work?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const body = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(body.question).toBe("How does that work?");
  expect(body.history).toEqual([{ role: "tutor", payload }]);
  await waitFor(() => expect(screen.getAllByText("Lesson")).toHaveLength(2));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "And then?" } });
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
  vi.stubGlobal("fetch", fetchMock);
  render(<TutorPanel topic="Concurrency" level="Beginner" onClose={() => {}} />);
  await screen.findByText("Lesson");
  expect(screen.queryByText(/Concept diagram/)).not.toBeInTheDocument();
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
  vi.stubGlobal("fetch", fetchMock);
  render(<TutorPanel topic="Concurrency" level="Beginner" onClose={() => {}} />);
  await screen.findByText("Lesson");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "How do threads share memory?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Tutor unavailable");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Try again" } });
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
