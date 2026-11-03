import React from "react";
import { render, screen } from "@testing-library/react";
import Home from "./page";

vi.mock("./auth-button", () => ({ default: () => null }));
vi.mock("./auth-gate", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("./topics-list", () => ({ default: () => null }));

describe("Home", () => {
  it("renders the LearnAI heading", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /learnai/i }),
    ).toBeInTheDocument();
  });
});
