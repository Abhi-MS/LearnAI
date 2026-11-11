import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import SocraticGraph from "./socratic-graph";

const payload = {
  narrative: "An overview.",
  analogies: [],
  socratic_questions: ["What next?"],
  visualization_nodes: [
    { id: "a", label: "Start", description: "Start here." },
    { id: "b", label: "Finish", description: "Start leads to Finish." },
  ],
  visualization_edges: [{ source: "a", target: "b", label: "leads to" }],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("masks a node in the graph, relationships and descriptions until the answer is correct", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ correct: false, feedback: "Try another term." }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ correct: true, feedback: "Correct!" }) });
  vi.stubGlobal("fetch", fetchMock);
  render(<SocraticGraph topic="Processes" payload={payload} />);
  expect(screen.getByRole("button", { name: "Missing diagram node" })).toHaveTextContent("____");
  expect(screen.getByLabelText("Diagram connections")).toHaveTextContent("____ → Finish: leads to");
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  expect(screen.getByText(/____ leads to Finish/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Missing diagram node" }));
  expect(screen.queryByText("Start here.")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Fill in the missing node label:"), { target: { value: "Beginning" } });
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  await screen.findByText("Try another term.");
  expect(screen.getByRole("button", { name: "Missing diagram node" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  await screen.findByText("Correct!");
  expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    topic: "Processes", target: { kind: "node", id: "a" }, answer: "Beginning",
  });
});

it("masks a bridge edge and allows retry after an assessment error or revealing the answer", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Try again later." }) }));
  render(<SocraticGraph topic="Processes" payload={payload} />);
  expect(screen.getByLabelText("Diagram connections")).toHaveTextContent("Start → Finish: ____");
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  expect(screen.getByText(/Start ____ Finish/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Fill in the missing connection label:"), { target: { value: "connects" } });
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  await screen.findByText("Try again later.");
  expect(screen.getByRole("button", { name: "Check answer" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  expect(screen.getByLabelText("Diagram connections")).toHaveTextContent("Start → Finish: leads to");
});
