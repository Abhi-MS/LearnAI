"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function ErrorToast({ message, children }: { message: string; children?: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let viewport = document.querySelector<HTMLDivElement>("[data-toast-viewport]");
    if (!viewport) {
      viewport = document.createElement("div");
      viewport.className = "toast-viewport";
      viewport.dataset.toastViewport = "";
      document.body.appendChild(viewport);
    }
    const element = document.createElement("div");
    element.className = "toast-host";
    viewport.appendChild(element);
    setHost(element);
    return () => {
      element.remove();
      if (!viewport.hasChildNodes()) viewport.remove();
    };
  }, []);

  useEffect(() => setDismissed(false), [message]);

  if (!host || dismissed) return null;
  return createPortal(
    <div className="error-toast">
      <span className="error-toast-icon" aria-hidden="true">!</span>
      <div className="error-toast-content">
        <p role="alert">{message}</p>
        {children && <div className="error-toast-actions">{children}</div>}
      </div>
      <button type="button" className="error-toast-dismiss" aria-label="Dismiss error" onClick={() => setDismissed(true)}>×</button>
    </div>,
    host,
  );
}
