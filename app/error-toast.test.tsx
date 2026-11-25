import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ErrorToast from "./error-toast";

it("stacks persistent errors, allows dismissal, and cleans up the viewport", () => {
  vi.useFakeTimers();
  try {
    const { rerender, unmount } = render(<><ErrorToast message="First error" /><ErrorToast message="Second error" /></>);
    const viewport = document.querySelector("[data-toast-viewport]");
    if (!(viewport instanceof HTMLElement)) throw new Error("Toast viewport not found");
    expect(within(viewport).getAllByRole("alert")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(60000));
    expect(screen.getByText("First error")).toBeInTheDocument();
    const first = screen.getByText("First error").closest(".error-toast");
    if (!(first instanceof HTMLElement)) throw new Error("Toast not found");
    fireEvent.click(within(first).getByRole("button", { name: "Dismiss error" }));
    expect(screen.queryByText("First error")).not.toBeInTheDocument();
    expect(screen.getByText("Second error")).toBeInTheDocument();
    rerender(<><ErrorToast message="New error" /><ErrorToast message="Second error" /></>);
    expect(screen.getByText("New error")).toBeInTheDocument();
    unmount();
    expect(document.querySelector("[data-toast-viewport]")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
