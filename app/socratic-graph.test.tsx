import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import SocraticGraph from "./socratic-graph";

it("shows the complete diagram and lets learners explore either node", () => {
  render(<SocraticGraph payload={{
    narrative: "An overview.",
    analogies: [],
    socratic_questions: [],
    visualization_nodes: [
      { id: "a", label: "Start", description: "Start here." },
      { id: "b", label: "Finish", description: "Start leads to Finish." },
    ],
    visualization_edges: [{ source: "a", target: "b", label: "leads to" }],
  }} />);

  expect(screen.getByLabelText("Diagram connections")).toHaveTextContent("Start → Finish: leads to");
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(screen.getByText("Start here.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  expect(screen.getByText("Start leads to Finish.")).toBeInTheDocument();
  expect(screen.queryByText(/Fill in the missing/)).not.toBeInTheDocument();
});
