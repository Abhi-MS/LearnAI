import React from "react";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";

// Emits sentry-trace/baggage meta tags so the browser pageload continues the server's trace
export function generateMetadata(): Metadata {
  return {
    title: "LearnAI",
    description:
      "Daily learning app for developers using AI to rebuild fundamentals.",
    other: { ...Sentry.getTraceData() },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
