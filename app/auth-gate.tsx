"use client";

import React, { useEffect, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { createSupabaseBrowserClient } from "../lib/supabase-browser";
import ErrorToast from "./error-toast";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [guest, setGuest] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const captchaRef = useRef<TurnstileInstance>(null);
  const signingInRef = useRef(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(!!data.user);
      setGuest(!!data.user?.is_anonymous);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
      setGuest(!!session?.user?.is_anonymous);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!guest) return;
    let active = true;
    async function recordActivity() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/guest", { method: "POST" });
        if (!response.ok) throw new Error("Could not update guest activity.");
        if (active) setActivityError("");
      } catch {
        if (active) setActivityError("Could not update guest activity. Refresh or try again later to keep this guest session active.");
      }
    }
    void recordActivity();
    const interval = window.setInterval(recordActivity, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", recordActivity);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", recordActivity);
    };
  }, [guest]);

  async function signInAsGuest() {
    if (!captchaToken || signingInRef.current) return;
    signingInRef.current = true;
    setSigningIn(true);
    setAuthError("");
    try {
      const { data, error } = await supabase.auth.signInAnonymously({
        options: { captchaToken },
      });
      if (error) throw error;
      if (!data.session) throw new Error("Guest sign-in did not create a session. Please try again.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Guest sign-in failed. Please try again.");
    } finally {
      setCaptchaToken("");
      captchaRef.current?.reset();
      signingInRef.current = false;
      setSigningIn(false);
    }
  }

  async function signInWithGoogle() {
    setAuthError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Google sign-in failed. Please try again.");
    }
  }

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
          Learning goals, topics (including recently studied topics), active tutor conversations, saved topic notes, and diagram answers are sent to Google Gemini to
          generate responses, summaries, or assessments. Topic summaries are saved to your account. Please don&apos;t enter sensitive or confidential information.
        </p>
        <p className="guest-notice">
          Guest progress is tied to this browser. Sign out deletes it; inactive guest accounts are deleted after 30 days. Link Google to keep it.
        </p>
        {siteKey ? (
          <>
            <Turnstile
              ref={captchaRef}
              siteKey={siteKey}
              options={{ theme: "light" }}
              scriptOptions={{ onError: () => { setCaptchaToken(""); setCaptchaError("Verification failed to load. Refresh the page to try again."); } }}
              onSuccess={(token) => { setCaptchaToken(token); setCaptchaError(""); }}
              onExpire={() => { setCaptchaToken(""); setCaptchaError("Verification expired. Please complete it again."); }}
              onTimeout={() => { setCaptchaToken(""); setCaptchaError("Verification timed out. Please try again."); }}
              onError={() => { setCaptchaToken(""); setCaptchaError("Verification failed to load or complete. Please try again."); }}
              onUnsupported={() => { setCaptchaToken(""); setCaptchaError("Verification is not supported in this browser."); }}
            />
            {captchaError && <ErrorToast message={captchaError} />}
            <button type="button" className="primary" disabled={!captchaToken || signingIn} onClick={() => { void signInAsGuest(); }}>
              {signingIn ? "Starting guest session..." : "Continue as guest"}
            </button>
          </>
        ) : (
          <ErrorToast message="Guest access is unavailable: CAPTCHA is not configured." />
        )}
        <button
          type="button"
          className="chip-button"
          disabled={signingIn}
          onClick={() => { void signInWithGoogle(); }}
        >
          Sign in with Google
        </button>
        {authError && <ErrorToast message={authError} />}
      </main>
    );
  }

  return <>{activityError && <ErrorToast message={activityError} />}{children}</>;
}
