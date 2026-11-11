"use client";

import React, { useId, useState } from "react";
import { diagramAssessmentSchema, type SocraticPayload } from "../lib/types/socratic";

type Target = { kind: "node"; id: string } | { kind: "edge"; index: number };

function chooseTarget(payload: SocraticPayload): Target {
  const { visualization_nodes: nodes, visualization_edges: edges } = payload;
  const degrees = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  const highestDegree = Math.max(...Array.from(degrees.values()));
  const candidates: Target[] = nodes
    .filter((node) => degrees.get(node.id) === highestDegree)
    .map((node) => ({ kind: "node", id: node.id }));

  edges.forEach((edge, index) => {
    const visited = new Set([edge.source]);
    const queue = [edge.source];
    while (queue.length) {
      const current = queue.shift();
      for (let i = 0; i < edges.length; i++) {
        if (i === index) continue;
        const other = edges[i].source === current ? edges[i].target
          : edges[i].target === current ? edges[i].source : null;
        if (other && !visited.has(other)) {
          visited.add(other);
          queue.push(other);
        }
      }
    }
    if (!visited.has(edge.target)) candidates.push({ kind: "edge", index });
  });
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export default function SocraticGraph({ topic, payload }: { topic: string; payload: SocraticPayload }) {
  const nodes = payload.visualization_nodes;
  const edges = payload.visualization_edges;
  const [target] = useState(() => chooseTarget(payload));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState("");
  const markerId = useId();
  const inputId = useId();
  const selected = nodes.find((node) => node.id === selectedId);
  const positions = new Map(nodes.map((node, index) => [node.id, index * 90 + 40]));
  const hiddenNode = !revealed && target.kind === "node" ? target.id : null;
  const hiddenEdge = !revealed && target.kind === "edge" ? target.index : null;
  const hiddenLabel = revealed ? null : target.kind === "node"
    ? nodes.find((node) => node.id === target.id)?.label
    : edges[target.index]?.label;
  const mask = (text: string) => hiddenLabel
    ? text.replace(new RegExp(hiddenLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "____")
    : text;
  const nodeLabel = (id: string) => {
    const node = nodes.find((item) => item.id === id);
    return id === hiddenNode ? "____" : node && mask(node.label);
  };

  async function checkAnswer(event: React.FormEvent) {
    event.preventDefault();
    const text = answer.trim();
    if (!text || checking) return;
    setChecking(true);
    setFeedback("");
    try {
      const response = await fetch("/api/tutor/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, payload, target, answer: text }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Assessment unavailable. Please try again.");
      const result = diagramAssessmentSchema.safeParse(data);
      if (!result.success) throw new Error("The assessment could not be displayed. Please try again.");
      setFeedback(result.data.correct ? result.data.feedback : mask(result.data.feedback));
      if (result.data.correct) setRevealed(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Assessment unavailable. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <figure className="socratic-graph">
      <figcaption>Concept diagram — select a node to explore it</figcaption>
      <div className="graph-scroll">
        <div className="graph-canvas" style={{ height: nodes.length * 90 }}>
          <svg width="460" height={nodes.length * 90} aria-hidden="true">
            <defs>
              <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
              </marker>
            </defs>
            {edges.map((edge, index) => {
              const from = positions.get(edge.source);
              const to = positions.get(edge.target);
              if (from === undefined || to === undefined) return null;
              const bend = 250 + index * 22;
              return (
                <g key={`${edge.source}-${edge.target}-${index}`}>
                  <path
                    d={`M 176 ${from} C ${bend} ${from}, ${bend} ${to}, 176 ${to}`}
                    className={selectedId && (edge.source === selectedId || edge.target === selectedId) ? "graph-edge selected" : "graph-edge"}
                    markerEnd={`url(#${markerId})`}
                  />
                  <text x={176 + 0.75 * (bend - 176) + 4} y={(from + to) / 2} className="graph-edge-number">{index + 1}</text>
                </g>
              );
            })}
          </svg>
          {nodes.map((node, index) => (
            <button
              key={node.id}
              type="button"
              className="graph-node"
              style={{ top: index * 90 + 15 }}
              aria-label={node.id === hiddenNode ? "Missing diagram node" : undefined}
              aria-pressed={selectedId === node.id}
              onClick={() => setSelectedId(node.id)}
            >
              {nodeLabel(node.id)}
            </button>
          ))}
        </div>
      </div>
      {selected && selected.id !== hiddenNode && <p className="graph-description"><strong>{mask(selected.label)}:</strong> {mask(selected.description)}</p>}
      <ul className="graph-relations" aria-label="Diagram connections">
        {edges.map((edge, index) => (
          <li key={`${edge.source}-${edge.target}-${index}`}>
            {index + 1}. {nodeLabel(edge.source)} → {nodeLabel(edge.target)}: {index === hiddenEdge ? "____" : mask(edge.label)}
          </li>
        ))}
      </ul>
      {!revealed && (
        <form className="diagram-challenge" onSubmit={checkAnswer}>
          <label htmlFor={inputId}>Fill in the missing {target.kind === "node" ? "node" : "connection"} label:</label>
          <input id={inputId} value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={500} disabled={checking} />
          <div className="diagram-challenge-actions">
            <button type="submit" className="chip-button" disabled={checking || !answer.trim()}>{checking ? "Checking..." : "Check answer"}</button>
            <button type="button" className="chip-button" disabled={checking} onClick={() => { setRevealed(true); setFeedback("Answer revealed; no assessment recorded."); }}>Reveal answer</button>
          </div>
        </form>
      )}
      {feedback && <p className="graph-description" role="status">{feedback}</p>}
    </figure>
  );
}
