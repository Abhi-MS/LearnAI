import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TopicsList from "./topics-list";

vi.mock("./tutor-panel", () => ({
  default: ({ topic }: { topic: string | null }) => <div>{topic && `Tutor: ${topic}`}</div>,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("custom topics", () => {
  it("loads private topics and adds a new category and a topic for tutoring", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tracks: [
        { slug: "backend", name: "Backend", topics: [{ slug: "apis", title: "APIs" }] },
      ] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ topics: [
        { id: "1", category: "backend", title: "Queues" },
      ] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ topic:
        { id: "2", category: "Architecture", title: "Event sourcing" },
      }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<TopicsList />);

    const backend = await screen.findByRole("heading", { name: "Backend" });
    expect(within(backend.closest("section")!).getByRole("button", { name: /Queues/ })).toBeInTheDocument();
    const customCard = screen.getByRole("region", { name: "Custom" });
    expect(customCard.parentElement?.firstElementChild).toBe(customCard);
    await waitFor(() => expect(within(customCard).getByRole("button", { name: "Add topic" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Event sourcing" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("New category"), { target: { value: "Architecture" } });
    fireEvent.click(screen.getByRole("button", { name: "Add topic" }));
    const topic = await screen.findByRole("button", { name: /Event sourcing/ });
    expect(screen.getByRole("heading", { name: "Architecture" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Added Event sourcing to Architecture.");
    expect(screen.getByLabelText("Topic")).toHaveValue("");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ title: "Event sourcing", category: "Architecture" });
    fireEvent.click(topic);
    expect(screen.getByText("Tutor: Event sourcing")).toBeInTheDocument();
  });

  it("shows a save error without losing the form", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tracks: [{ slug: "backend", name: "Backend", topics: [] }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ topics: [] }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Already exists." }) }));
    render(<TopicsList />);
    const addButton = await screen.findByRole("button", { name: "Add topic" });
    await waitFor(() => expect(addButton).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Queues" } });
    fireEvent.click(screen.getByRole("button", { name: "Add topic" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Already exists.");
    expect(screen.getByLabelText("Topic")).toHaveValue("Queues");
  });

  it("adds a topic to an existing category by default", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tracks: [{ slug: "backend", name: "Backend", topics: [] }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ topics: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ topic: { id: "3", title: "Queues", category: "Backend" } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<TopicsList />);
    const addButton = await screen.findByRole("button", { name: "Add topic" });
    await waitFor(() => expect(addButton).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Queues" } });
    fireEvent.click(screen.getByRole("button", { name: "Add topic" }));
    expect(await screen.findByRole("button", { name: /Queues/ })).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ title: "Queues", category: "Backend" });
  });

  it("reports when private topics cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tracks: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 503 }));
    render(<TopicsList />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded"));
    expect(screen.getByRole("button", { name: "Add topic" })).toBeDisabled();
  });
});
