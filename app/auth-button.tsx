"use client";

import React, { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../lib/supabase-browser";
import ErrorToast from "./error-toast";

export default function AuthButton({ onLeaveRequest }: { onLeaveRequest?: (action: () => void) => void }) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [confirmGuestExit, setConfirmGuestExit] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [linking, setLinking] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null),
    );
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("auth") === "link_error") {
      setSignOutError("Could not link Google. It may already be linked to another LearnAI account. Your guest progress is unchanged.");
      url.searchParams.delete("auth");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  if (!ready) return <div className="auth-slot" />;

  if (!user) {
    return (
      <div className="auth-slot">
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
      </div>
    );
  }

  const name = user.is_anonymous ? "Guest" : user.user_metadata?.full_name ?? user.email;
  function requestSignOut() {
    setConfirmGuestExit(false);
    const signOut = async () => {
      setSigningOut(true);
      setSignOutError("");
      try {
        if (user?.is_anonymous) {
          const response = await fetch("/api/guest", { method: "DELETE" });
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Could not delete guest progress. Please try again.");
          }
        }
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      } catch (error) {
        setSignOutError(error instanceof Error ? error.message : "Sign out failed. Please try again.");
      } finally {
        setSigningOut(false);
      }
    };
    if (onLeaveRequest) onLeaveRequest(() => { void signOut(); });
    else void signOut();
  }

  function requestLink() {
    const link = async () => {
      setLinking(true);
      setSignOutError("");
      try {
        const activity = await fetch("/api/guest", { method: "POST" });
        if (!activity.ok) throw new Error("Could not keep your guest session active. Please try again.");
        const { error } = await supabase.auth.linkIdentity({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback?link=1` },
        });
        if (error) {
          if (error.code === "manual_linking_disabled") {
            setSignOutError("Google linking is not enabled. Contact the app administrator. Your guest progress is unchanged.");
          } else if (error.code === "identity_already_exists") {
            setSignOutError("This Google account is already linked to another LearnAI account and cannot be merged. Your guest progress is unchanged.");
          } else {
            setSignOutError("Could not link Google. Please try again. Your guest progress is unchanged.");
          }
          setLinking(false);
        }
      } catch (error) {
        setSignOutError(error instanceof Error && error.message === "Could not keep your guest session active. Please try again."
          ? error.message
          : "Could not link Google. Please try again. Your guest progress is unchanged.");
        setLinking(false);
      }
    };
    if (onLeaveRequest) onLeaveRequest(() => { void link(); });
    else void link();
  }

  return (
    <div className="auth-slot">
      {user.user_metadata?.avatar_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="avatar" src={user.user_metadata.avatar_url} alt="" referrerPolicy="no-referrer" />
      )}
      <span className="auth-name">{name}</span>
      {user.is_anonymous && <button type="button" className="chip-button" disabled={linking || signingOut} onClick={requestLink}>{linking ? "Connecting..." : "Keep progress"}</button>}
      <button type="button" className="chip-button" disabled={signingOut || linking} onClick={() => {
        if (user.is_anonymous) setConfirmGuestExit(true);
        else requestSignOut();
      }}>
        {signingOut ? "Signing out..." : "Sign out"}
      </button>
      {confirmGuestExit && (
        <div className="guest-signout-confirmation" role="group" aria-label="Confirm guest sign out">
          <p>Signing out permanently deletes this guest&apos;s progress. Link Google first to keep it.</p>
          <button type="button" className="chip-button" onClick={() => setConfirmGuestExit(false)}>Cancel</button>{" "}
          <button type="button" className="primary" onClick={requestSignOut}>Sign out anyway</button>
        </div>
      )}
      {signOutError && <ErrorToast message={signOutError} />}
    </div>
  );
}
