import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TopicsList from "./topics-list";

vi.mock("./auth-button", () => ({ default: () => null }));

const firstId = "c0a80101-0000-4000-8000-000000000001";
const secondId = "c0a80101-0000-4000-8000-000000000002";
const plan = {
  activeAreaId: "area",
  areas: [{ id: "area", name: "Science", categories: [{
    id: "category", name: "Science", topics: [{ id: firstId, title: "Water", hasNote: true }, { id: secondId, title: "Weather", hasNote: false }],
  }] }],
};
const payload = {
  narrative: "An explanation.", analogies: [], socratic_questions: ["What next?"],
  visualization_nodes: [], visualization_edges: [],
};
const note = { note: "Evaporation changes water into vapor.", depth: "developing", nextStep: "Explore clouds.", revision: 1 };
const ok = (data: unknown) => ({ ok: true, json: async () => data });

afterEach(() => vi.unstubAllGlobals());

async function openAndStudy() {
  fireEvent.click(await screen.findByRole("button", { name: /^Water/ }));
  await screen.findByText("An explanation.");
  fireEvent.click(screen.getByText("Topic notes"));
  expect(screen.getByText(/Evaporation changes/)).toBeVisible();
  fireEvent.change(screen.getByPlaceholderText("Ask about Water…"), { target: { value: "How does evaporation work?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.getAllByText("An explanation.")).toHaveLength(2));
}

function installFetch() {
  let attempts = 0;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/learning") return Promise.resolve(ok(plan));
    if (url.startsWith("/api/tutor/summary?")) return Promise.resolve(ok({ note: url.includes(firstId) ? note : null }));
    if (url === "/api/tutor/summary" && init?.method === "POST") {
      attempts++;
      return Promise.resolve(attempts === 1
        ? { ok: false, json: async () => ({ error: "Could not save your topic note." }) }
        : ok({ note: { ...note, revision: 2 } }));
    }
    if (url === "/api/tutor") return Promise.resolve(ok({ payload }));
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("keeps the conversation open on save failure and retries before switching topics", async () => {
  const fetchMock = installFetch();
  render(<TopicsList />);
  await openAndStudy();
  fireEvent.click(screen.getByRole("button", { name: /^Weather/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save your topic note.");
  expect(screen.getByRole("heading", { name: "Water" })).toBeInTheDocument();
  const summaryCall = fetchMock.mock.calls.find(([url]) => url === "/api/tutor/summary");
  expect(JSON.parse(String(summaryCall?.[1]?.body))).toMatchObject({ topicId: firstId });
  fireEvent.click(screen.getByRole("button", { name: "Retry saving and leave" }));
  expect(await screen.findByRole("heading", { name: "Weather" })).toBeInTheDocument();
});

it("allows an explicit exit without saving after a failure", async () => {
  installFetch();
  render(<TopicsList />);
  await openAndStudy();
  fireEvent.click(screen.getByRole("button", { name: "Close tutor" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Leave without saving" }));
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Water" })).not.toBeInTheDocument());
});

it("shows saved notes even if the tutor is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url === "/api/learning") return Promise.resolve(ok(plan));
    if (url.startsWith("/api/tutor/summary?")) return Promise.resolve(ok({ note }));
    return Promise.resolve({ ok: false, status: 503, json: async () => ({ error: "Tutor unavailable" }) });
  }));
  render(<TopicsList />);
  fireEvent.click(await screen.findByRole("button", { name: /^Water/ }));
  await screen.findByText("Tutor unavailable");
  fireEvent.click(await screen.findByText("Topic notes"));
  expect(screen.getByText(/Evaporation changes/)).toBeVisible();
});

it("does not summarize an opening lesson without a completed follow-up", async () => {
  const fetchMock = installFetch();
  render(<TopicsList />);
  fireEvent.click(await screen.findByRole("button", { name: /^Water/ }));
  await screen.findByText("An explanation.");
  fireEvent.click(screen.getByRole("button", { name: "Close tutor" }));
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Water" })).not.toBeInTheDocument());
  expect(fetchMock.mock.calls.some(([url]) => url === "/api/tutor/summary")).toBe(false);
});

it("attempts a keepalive save on browser page exit", async () => {
  const fetchMock = installFetch();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(<TopicsList />);
    await openAndStudy();
    fireEvent(window, new Event("pagehide"));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/tutor/summary" && init?.keepalive)).toBe(true));
  } finally {
    consoleError.mockRestore();
  }
});

it("previews a saved note without opening the tutor and closes with Escape", async () => {
  const fetchMock = installFetch();
  render(<TopicsList />);
  const trigger = await screen.findByRole("button", { name: "Notes for Water" });
  expect(screen.queryByRole("button", { name: "Notes for Weather" })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  const popup = await screen.findByRole("dialog", { name: "Notes for Water" });
  expect(await within(popup).findByText(/Evaporation changes/)).toBeVisible();
  expect(within(popup).getByText(/Explore clouds/)).toBeInTheDocument();
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(fetchMock.mock.calls.some(([url]) => url === "/api/tutor")).toBe(false);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("reports a notes error, retries, and shows when no note exists", async () => {
  let requests = 0;
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url === "/api/learning") return Promise.resolve(ok(plan));
    requests++;
    return Promise.resolve(requests === 1
      ? { ok: false, json: async () => ({ error: "Notes unavailable." }) }
      : ok({ note: null }));
  }));
  render(<TopicsList />);
  fireEvent.click(await screen.findByRole("button", { name: "Notes for Water" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Notes unavailable.");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No saved notes yet.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Close notes" }));
  fireEvent.click(screen.getByRole("button", { name: "Notes for Water" }));
  await screen.findByText("No saved notes yet.");
  expect(requests).toBe(3);
});

it("ignores an earlier topic's response after switching previews", async () => {
  let finishWater!: (response: ReturnType<typeof ok>) => void;
  const pending = new Promise<ReturnType<typeof ok>>((resolve) => { finishWater = resolve; });
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url === "/api/learning") return Promise.resolve(ok({
      ...plan,
      areas: [{ ...plan.areas[0], categories: [{
        ...plan.areas[0].categories[0],
        topics: plan.areas[0].categories[0].topics.map((topic) => ({ ...topic, hasNote: true })),
      }] }],
    }));
    if (url.includes(firstId)) return pending;
    return Promise.resolve(ok({ note: null }));
  }));
  render(<TopicsList />);
  fireEvent.click(await screen.findByRole("button", { name: "Notes for Water" }));
  fireEvent.click(screen.getByRole("button", { name: "Notes for Weather" }));
  expect(await screen.findByText("No saved notes yet.")).toBeVisible();
  await act(async () => finishWater(ok({ note })));
  expect(screen.queryByText(/Evaporation changes/)).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Notes for Weather" })).toBeVisible();
});

it("adds a note icon after the first successful save without reloading the plan", async () => {
  const noNotesPlan = {
    ...plan,
    areas: [{ ...plan.areas[0], categories: [{
      ...plan.areas[0].categories[0],
      topics: plan.areas[0].categories[0].topics.map((topic) => ({ ...topic, hasNote: false })),
    }] }],
  };
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/learning") return Promise.resolve(ok(noNotesPlan));
    if (url.startsWith("/api/tutor/summary?")) return Promise.resolve(ok({ note: null }));
    if (url === "/api/tutor/summary" && init?.method === "POST") return Promise.resolve(ok({ note }));
    if (url === "/api/tutor") return Promise.resolve(ok({ payload }));
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<TopicsList />);
  fireEvent.click(await screen.findByRole("button", { name: /^Water/ }));
  await screen.findByText("An explanation.");
  expect(screen.queryByRole("button", { name: "Notes for Water" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("Ask about Water…"), { target: { value: "How does evaporation work?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.getAllByText("An explanation.")).toHaveLength(2));
  fireEvent.click(screen.getByRole("button", { name: "Close tutor" }));
  expect(await screen.findByRole("button", { name: "Notes for Water" })).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/learning")).toHaveLength(1);
});
