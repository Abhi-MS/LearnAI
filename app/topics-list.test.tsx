import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TopicsList from "./topics-list";

vi.mock("./tutor-panel", () => ({
  default: ({ topic }: { topic: string | null }) => <div>{topic && `Tutor: ${topic}`}</div>,
}));
vi.mock("./auth-button", () => ({ default: () => null }));

const category = { id: "1", name: "Photography", topics: [{ id: "topic-1", title: "Lighting", hasNote: false }] };
const area = { id: "area-1", name: "Photography", categories: [category] };
const plan = { activeAreaId: area.id, areas: [area] };
const ok = (data: unknown) => ({ ok: true, json: async () => data });
const failed = (error: string) => ({ ok: false, json: async () => ({ error }) });

afterEach(() => vi.unstubAllGlobals());

describe("learning plan", () => {
  it("onboards a user, saves a goal and loads their categories", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ activeAreaId: null, areas: [] }))
      .mockResolvedValueOnce(ok({ ok: true }))
      .mockResolvedValueOnce(ok(plan));
    vi.stubGlobal("fetch", fetchMock);
    render(<TopicsList />);
    fireEvent.change(await screen.findByLabelText("Your industry or learning goal"), { target: { value: "Photography" } });
    fireEvent.click(screen.getByRole("button", { name: "Create my learning plan" }));
    expect(await screen.findByRole("heading", { name: "Photography" })).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ goal: "Photography" });
    fireEvent.click(screen.getByRole("button", { name: /^Lighting/ }));
    expect(screen.getByText("Tutor: Lighting")).toBeInTheDocument();
  });

  it("shows a generation failure and retains the goal for retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok({ activeAreaId: null, areas: [] })).mockResolvedValueOnce(failed("Please try again.")));
    render(<TopicsList />);
    fireEvent.change(await screen.findByLabelText("Your industry or learning goal"), { target: { value: "Music" } });
    fireEvent.click(screen.getByRole("button", { name: "Create my learning plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try again.");
    expect(screen.getByLabelText("Your industry or learning goal")).toHaveValue("Music");
  });

  it("adds a topic to a new category and keeps the custom card first", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(plan))
      .mockResolvedValueOnce(ok({ category: { id: "2", name: "Art" }, topic: { id: "2", title: "Painting", category: "Art" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TopicsList />);
    const card = await screen.findByRole("region", { name: "Custom" });
    expect(card.parentElement?.firstElementChild).toBe(card);
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Painting" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "new" } });
    fireEvent.change(screen.getByLabelText("New category"), { target: { value: "Art" } });
    fireEvent.click(screen.getByRole("button", { name: "Add topic" }));
    expect(await screen.findByRole("heading", { name: "Art" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Added Painting to Art.");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ title: "Painting", category: "Art", areaId: "area-1" });
  });

  it("requires confirmation and closes the tutor when deleting a category", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(plan)).mockResolvedValueOnce(ok({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TopicsList />);
    fireEvent.click(await screen.findByRole("button", { name: /^Lighting/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Photography category" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const confirmation = screen.getByRole("group", { name: /Delete Photography/ });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete category" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Photography" })).not.toBeInTheDocument());
    expect(screen.queryByText("Tutor: Lighting")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/learning/categories/1", { method: "DELETE" });
  });

  it("retains a category and displays errors when deletion fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok(plan)).mockResolvedValueOnce(failed("Delete failed.")));
    render(<TopicsList />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete Photography category" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete category" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Delete failed.");
    expect(screen.getByRole("heading", { name: "Photography" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: /Delete Photography/ })).not.toBeInTheDocument();
  });

  it("preserves input when saving fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok(plan)).mockResolvedValueOnce(failed("Already exists.")));
    render(<TopicsList />);
    fireEvent.change(await screen.findByLabelText("Topic"), { target: { value: "Lighting" } });
    fireEvent.click(screen.getByRole("button", { name: "Add topic" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Already exists.");
    expect(screen.getByLabelText("Topic")).toHaveValue("Lighting");
  });

  it("reports loading failures and offers retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(failed("Unavailable.")).mockResolvedValueOnce(ok({ activeAreaId: area.id, areas: [{ ...area, categories: [] }] })));
    render(<TopicsList />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unavailable.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Custom" })).toBeInTheDocument();
  });

  it("adds a separate exploration and switches back without mixing categories", async () => {
    const music = { id: "area-2", name: "Music", categories: [{ id: "2", name: "Theory", topics: [{ id: "m", title: "Rhythm" }] }] };
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(plan))
      .mockResolvedValueOnce(ok({ ok: true }))
      .mockResolvedValueOnce(ok({ activeAreaId: music.id, areas: [area, music] }))
      .mockResolvedValueOnce(ok({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<TopicsList />);
    const select = await screen.findByLabelText("Currently exploring");
    fireEvent.change(select, { target: { value: "add" } });
    fireEvent.change(screen.getByLabelText("Your industry or learning goal"), { target: { value: "Music" } });
    fireEvent.click(screen.getByRole("button", { name: "Create my learning plan" }));
    expect(await screen.findByRole("heading", { name: "Theory" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Photography" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Currently exploring"), { target: { value: "area-1" } });
    expect(await screen.findByRole("heading", { name: "Photography" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Theory" })).not.toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ areaId: "area-1" });
  });

  it("keeps the active exploration when switching fails", async () => {
    const music = { id: "area-2", name: "Music", categories: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok({ ...plan, areas: [area, music] })).mockResolvedValueOnce(failed("Switch failed.")));
    render(<TopicsList />);
    fireEvent.change(await screen.findByLabelText("Currently exploring"), { target: { value: "area-2" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Switch failed.");
    expect(screen.getByLabelText("Currently exploring")).toHaveValue("area-1");
    expect(screen.getByRole("heading", { name: "Photography" })).toBeInTheDocument();
  });
});
