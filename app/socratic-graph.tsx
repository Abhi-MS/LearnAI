"use client";

import React, { useId, useState } from "react";
import type { SocraticPayload } from "../lib/types/socratic";

export default function SocraticGraph({
  nodes,
  edges,
}: {
  nodes: SocraticPayload["visualization_nodes"];
  edges: SocraticPayload["visualization_edges"];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const markerId = useId();
  const selected = nodes.find((node) => node.id === selectedId);
  const positions = new Map(nodes.map((node, index) => [node.id, index * 90 + 40]));

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
              aria-pressed={selectedId === node.id}
              onClick={() => setSelectedId(node.id)}
            >
              {node.label}
            </button>
          ))}
        </div>
      </div>
      {selected && <p className="graph-description"><strong>{selected.label}:</strong> {selected.description}</p>}
      <ul className="graph-relations" aria-label="Diagram connections">
        {edges.map((edge, index) => (
          <li key={`${edge.source}-${edge.target}-${index}`}>
            {index + 1}. {nodes.find((node) => node.id === edge.source)?.label} → {nodes.find((node) => node.id === edge.target)?.label}: {edge.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
