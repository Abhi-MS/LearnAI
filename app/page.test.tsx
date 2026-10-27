import React from "react";
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home", () => {
  it("renders the LearnAI heading", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /learnai/i }),
    ).toBeInTheDocument();
  });
});
