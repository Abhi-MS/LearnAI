"use client";

import React, { useEffect, useState } from "react";
import TutorPanel from "./tutor-panel";
import AuthButton from "./auth-button";
import { LEVELS, type Level } from "../lib/levels";
import { MAX_CATEGORY_LENGTH, MAX_LEARNING_GOAL_LENGTH, MAX_TOPIC_LENGTH } from "../lib/topic-limits";

type Topic = { id: string; title: string };
type Category = { id: string; name: string; topics: Topic[] };
type Area = { id: string; name: string; categories: Category[] };
type Plan = { activeAreaId: string | null; areas: Area[] };
type SelectedTopic = Topic & { categoryId: string };

const STORAGE_KEY = "learnai:levels";

async function readResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

export default function TopicsList() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadError, setLoadError] = useState("");
  const [goal, setGoal] = useState("");
  const [generating, setGenerating] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const [addingArea, setAddingArea] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [selected, setSelected] = useState<SelectedTopic | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [levels, setLevels] = useState<Record<string, Level>>({});

  async function loadPlan() {
    try {
      const data = await readResponse(await fetch("/api/learning"));
      setPlan(data);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Your learning plan is unavailable.");
    }
  }

  useEffect(() => {
    try {
      setLevels(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
    } catch {
      setLevels({});
    }
    loadPlan();
  }, []);

  async function generatePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (generating) return;
    setGenerating(true);
    setOnboardingError("");
    try {
      const response = await fetch("/api/learning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      await readResponse(response);
      await loadPlan();
      setAddingArea(false);
      setGoal("");
      setSelected(null);
      setCategory("");
      setTitle("");
      setNewCategory("");
      setSuccess("");
    } catch (error) {
      setOnboardingError(error instanceof Error ? error.message : "Could not create your learning plan.");
    } finally {
      setGenerating(false);
    }
  }

  async function addTopic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || switching || !plan || !activeArea) return;
    const chosenCategory = category === "new" || (!category && activeArea.categories.length === 0)
      ? newCategory
      : category ? category.slice("existing:".length) : activeArea.categories[0].name;
    setFormError("");
    setSuccess("");
    setSaving(true);
    try {
      const data = await readResponse(await fetch("/api/custom-topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, category: chosenCategory, areaId: activeArea.id }),
      }));
      setPlan((current) => {
        if (!current) return current;
        const area = current.areas.find((item) => item.id === activeArea.id);
        if (!area) return current;
        const found = area.categories.some((item) => item.id === data.category.id);
        const categories = found
          ? area.categories.map((item) => item.id === data.category.id
            ? { ...item, topics: [...item.topics, { id: data.topic.id, title: data.topic.title }] }
            : item)
          : [...area.categories, { ...data.category, topics: [{ id: data.topic.id, title: data.topic.title }] }];
        return { ...current, areas: current.areas.map((item) => item.id === area.id ? { ...item, categories } : item) };
      });
      setTitle("");
      setNewCategory("");
      setCategory(`existing:${data.category.name}`);
      setSuccess(`Added ${data.topic.title} to ${data.category.name}.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not add the topic.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory() {
    if (!confirmDelete || deleting || switching || !activeArea) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await readResponse(await fetch(`/api/learning/categories/${confirmDelete.id}`, { method: "DELETE" }));
      setPlan((current) => current && {
        ...current,
        areas: current.areas.map((area) => area.id === activeArea.id
          ? { ...area, categories: area.categories.filter((item) => item.id !== confirmDelete.id) }
          : area),
      });
      setSelected((current) => current?.categoryId === confirmDelete.id ? null : current);
      setCategory("");
      setSuccess("");
      setConfirmDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete the category.");
    } finally {
      setDeleting(false);
    }
  }

  async function switchArea(areaId: string) {
    if (!plan || areaId === plan.activeAreaId || switching) return;
    setSwitching(true);
    setSwitchError("");
    try {
      await readResponse(await fetch("/api/learning", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ areaId }),
      }));
      setPlan((current) => current && { ...current, activeAreaId: areaId });
      setSelected(null);
      setConfirmDelete(null);
      setCategory("");
      setTitle("");
      setNewCategory("");
      setSuccess("");
      setFormError("");
      setAddingArea(false);
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : "Could not switch learning areas.");
    } finally {
      setSwitching(false);
    }
  }

  const activeArea = plan?.areas.find((area) => area.id === plan.activeAreaId);
  const navigation = (
    <div className="topbar">
      {plan && activeArea && (
        <div className="exploration-control">
          <label htmlFor="active-exploration">Currently exploring</label>
          <select
            id="active-exploration"
            className="exploration-select"
            value={addingArea ? "add" : activeArea.id}
            disabled={switching || saving || deleting || generating}
            onChange={(event) => {
              if (event.target.value === "add") {
                setAddingArea(true);
                setOnboardingError("");
                setSwitchError("");
              } else {
                if (event.target.value === activeArea.id) setAddingArea(false);
                else switchArea(event.target.value);
              }
            }}
          >
            {plan.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            <option value="add">+ Add exploration</option>
          </select>
          {switchError && <p className="status status-error" role="alert">{switchError}</p>}
        </div>
      )}
      <AuthButton />
    </div>
  );

  if (loadError) {
    return <>{navigation}<div><p className="status status-error" role="alert">{loadError}</p><button className="primary" type="button" onClick={loadPlan}>Try again</button></div></>;
  }

  if (!plan) return <>{navigation}<div className="track-grid" aria-busy="true"><div className="card skeleton" /><div className="card skeleton" /><div className="card skeleton" /></div></>;

  if (!activeArea || addingArea) {
    return (
      <>
      {navigation}
      <section className="onboarding">
        <span className="badge">Learning tailored to you</span>
        <h1>What would you like to learn?</h1>
        <p className="lead">Tell us your industry or a subject you are curious about. We&apos;ll create three categories with starter topics for you.</p>
        <form className="custom-topic-form onboarding-form" onSubmit={generatePlan}>
          <label htmlFor="learning-goal">Your industry or learning goal</label>
          <input id="learning-goal" placeholder="e.g. photography, healthcare, or personal finance" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={MAX_LEARNING_GOAL_LENGTH} disabled={generating} required />
          {onboardingError && <p className="status status-error" role="alert">{onboardingError}</p>}
          <button type="submit" className="primary" disabled={generating}>{generating ? "Creating your learning plan..." : "Create my learning plan"}</button>
          {activeArea && <button type="button" className="chip-button" disabled={generating} onClick={() => { setAddingArea(false); setOnboardingError(""); setGoal(""); }}>Cancel</button>}
        </form>
      </section>
      </>
    );
  }

  return (
    <>
      {navigation}
      <section className="hero">
        <span className="badge">Learning tailored to you</span>
        <h1>LearnAI</h1>
        <p className="lead">Explore your interests with an AI tutor that adapts to your level.</p>
      </section>
      <section>
        <h2>Pick a category</h2>
        <div className="track-grid">
          <section className="card custom-topic-card" aria-labelledby="custom-topic-heading">
            <h3 id="custom-topic-heading">Custom</h3>
            <p className="custom-topic-description">Add a topic just for you.</p>
            <form className="custom-topic-form" onSubmit={addTopic}>
              <label htmlFor="custom-topic-title">Topic</label>
              <input id="custom-topic-title" placeholder="e.g. Photography basics" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={MAX_TOPIC_LENGTH} disabled={saving || switching} required />
              <label htmlFor="custom-topic-category">Category</label>
              <select id="custom-topic-category" value={category || (activeArea.categories[0] ? `existing:${activeArea.categories[0].name}` : "new")} onChange={(event) => setCategory(event.target.value)} disabled={saving || switching}>
                {activeArea.categories.map((item) => <option key={item.id} value={`existing:${item.name}`}>{item.name}</option>)}
                <option value="new">Add a new category</option>
              </select>
              {(category === "new" || (!category && activeArea.categories.length === 0)) && (
                <>
                  <label htmlFor="custom-topic-new-category">New category</label>
                  <input id="custom-topic-new-category" placeholder="e.g. Photography" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} maxLength={MAX_CATEGORY_LENGTH} disabled={saving || switching} required />
                </>
              )}
              {formError && <p className="status status-error" role="alert">{formError}</p>}
              {success && <p className="custom-topic-success" role="status">{success}</p>}
              <button type="submit" className="primary" disabled={saving || deleting || switching}>{saving ? "Adding..." : "Add topic"}</button>
            </form>
          </section>
          {activeArea.categories.map((item) => (
            <section key={item.id} className="card">
              <div className="category-heading">
                <h3>{item.name}</h3>
                <button type="button" className="delete-category" aria-label={`Delete ${item.name} category`} disabled={saving || deleting || switching} onClick={() => { setDeleteError(""); setConfirmDelete(item); }}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /></svg>
                </button>
              </div>
              <ul className="topic-list">
                {item.topics.map((topic) => (
                  <li key={topic.id}>
                    <button type="button" className={`topic-button${selected?.id === topic.id ? " active" : ""}`} onClick={() => setSelected({ ...topic, categoryId: item.id })}>
                      <span>{topic.title}</span><span className="level-chip">{levels[`custom-${topic.id}`] ?? LEVELS[0]}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {confirmDelete?.id === item.id && (
                <div className="delete-confirmation" role="group" aria-labelledby={`delete-title-${item.id}`}>
                  <p id={`delete-title-${item.id}`}>Delete {item.name} and all its topics permanently?</p>
                  {deleteError && <p className="status status-error" role="alert">{deleteError}</p>}
                  <div className="delete-actions">
                    <button type="button" className="chip-button" disabled={deleting} onClick={() => setConfirmDelete(null)}>Cancel</button>
                    <button type="button" className="primary" disabled={deleting || switching} onClick={deleteCategory}>{deleting ? "Deleting..." : "Delete category"}</button>
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>
        {!selected && <p className="status">Select a topic to start a tutoring session.</p>}
      </section>
      <TutorPanel key={selected?.id ?? "closed"} topic={selected?.title ?? null} level={selected ? levels[`custom-${selected.id}`] ?? LEVELS[0] : LEVELS[0]} onClose={() => setSelected(null)} />
    </>
  );
}
