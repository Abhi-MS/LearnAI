import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import QuizPanel from "./quiz-panel";

const topicId = "c0a80101-0000-4000-8000-000000000001";
const planId = "c0a80101-0000-4000-8000-000000000002";
const attemptId = "c0a80101-0000-4000-8000-000000000003";
const concepts = ["A", "B", "C", "D", "E"];
const questions = concepts.map((_, index) => ({
  type: index < 3 ? "multiple_choice" : "short_answer", prompt: `Question ${index + 1}`,
  options: index < 3 ? ["One", "Two", "Three", "Four"] : [],
}));
const grades = questions.map((_, questionIndex) => ({ questionIndex, correct: questionIndex < 4, feedback: "Feedback" }));
const ok = (data: object) => ({ ok: true, json: async () => data });

afterEach(() => vi.unstubAllGlobals());

it("offers an optional quiz, permits deferral, and reports a validated promotion", async () => {
  const fetchMock = vi.fn((_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.action === "plan") return Promise.resolve(ok({ plan: { id: planId, concepts, level: "Beginner" }, completed: false }));
    if (body.action === "start") return Promise.resolve(ok({ attemptId, questions }));
    return Promise.resolve(ok({ result: { correct: 4, total: 5, passed: true, level: "Advanced", completed: false, grades } }));
  });
  vi.stubGlobal("fetch", fetchMock);
  const onProgress = vi.fn();
  render(<QuizPanel topicId={topicId} level="Beginner" completed={false}
    coverage={{ covered: [0, 1], additional: ["Advanced material"], ready: true }} onProgress={onProgress} />);
  expect(await screen.findByText(/You may be ready/)).toBeInTheDocument();
  fireEvent.click(screen.getByText("Not now"));
  expect(screen.queryByText(/You may be ready/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Take quiz"));
  const group = await screen.findByRole("group", { name: "1. Question 1" });
  fireEvent.click(within(group).getByLabelText("One"));
  fireEvent.click(within(screen.getByRole("group", { name: "2. Question 2" })).getByLabelText("Two"));
  fireEvent.click(within(screen.getByRole("group", { name: "3. Question 3" })).getByLabelText("Three"));
  fireEvent.change(screen.getByLabelText("Answer question 4"), { target: { value: "Answer four" } });
  fireEvent.change(screen.getByLabelText("Answer question 5"), { target: { value: "Answer five" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit quiz" }));
  expect(await screen.findByText(/4 \/ 5 correct/)).toHaveTextContent("Passed");
  expect(onProgress).toHaveBeenCalledWith("Advanced", false);
  fireEvent.click(screen.getByRole("button", { name: "Collapse quiz" }));
  expect(screen.getByText(/4 \/ 5 correct/)).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Open quiz" }));
  expect(screen.getByText(/4 \/ 5 correct/)).toBeVisible();
  const submission = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body))).find((body) => body.action === "submit");
  expect(submission).toEqual({ action: "submit", attemptId, answers: ["One", "Two", "Three", "Answer four", "Answer five"] });
});

it("keeps answers available for retry when validation fails", async () => {
  vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
    const action = JSON.parse(String(init.body)).action;
    if (action === "plan") return Promise.resolve(ok({ plan: { id: planId, concepts, level: "Beginner" }, completed: false }));
    if (action === "start") return Promise.resolve(ok({ attemptId, questions }));
    return Promise.resolve({ ok: false, json: async () => ({ error: "Checks disagreed. Try again." }) });
  }));
  render(<QuizPanel topicId={topicId} level="Beginner" completed={false} onProgress={() => {}} />);
  fireEvent.click(await screen.findByText("Take quiz"));
  for (let index = 1; index <= 3; index++) fireEvent.click(within(await screen.findByRole("group", { name: `${index}. Question ${index}` })).getByLabelText("One"));
  fireEvent.change(screen.getByLabelText("Answer question 4"), { target: { value: "Keep me" } });
  fireEvent.change(screen.getByLabelText("Answer question 5"), { target: { value: "And me" } });
  fireEvent.click(screen.getByRole("button", { name: "Collapse quiz" }));
  fireEvent.click(screen.getByRole("button", { name: "Open quiz" }));
  expect(screen.getByLabelText("Answer question 4")).toHaveValue("Keep me");
  fireEvent.click(screen.getByText("Submit quiz"));
  await screen.findByText("Checks disagreed. Try again.");
  expect(screen.getByLabelText("Answer question 4")).toHaveValue("Keep me");
  await waitFor(() => expect(screen.getByRole("button", { name: "Submit quiz" })).toBeEnabled());
});
