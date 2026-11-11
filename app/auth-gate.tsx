"use client";

import React, { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase-browser";

// Shows the app only to signed-in users
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(!!session?.user),
    );
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (signedIn === null) return <main aria-busy="true" />;

  if (!signedIn) {
    return (
      <main className="signin-page">
        <span className="badge">Learning tailored to you</span>
        <h1>LearnAI</h1>
        <p className="lead">
          Explore what matters to you with an AI tutor that adapts to your level.
        </p>
        <p className="privacy-notice">
          Learning goals, topics (including recently studied topics), active tutor conversations, and diagram answers are sent to Google Gemini to
          generate responses or assess answers. Please don&apos;t enter sensitive or confidential information.
        </p>
        <button
          type="button"
          className="primary"
          onClick={() =>
            supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: `${window.location.origin}/auth/callback` },
            })
          }
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  return <>{children}</>;
}
