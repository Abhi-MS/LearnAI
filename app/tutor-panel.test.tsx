import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TutorPanel from "./tutor-panel";

afterEach(() => vi.unstubAllGlobals());

it("shows an accuracy disclaimer when the tutor is open", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ answer: "Lesson" }),
  }));
  render(<TutorPanel topic="Concurrency" level="Beginner" onClose={() => {}} />);
  expect(screen.getByText(/AI responses can be inaccurate or outdated/)).toBeInTheDocument();
  await screen.findByText("Lesson");
});
