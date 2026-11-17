"use client";

import React, { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../lib/supabase-browser";

export default function AuthButton({ onSignOutRequest }: { onSignOutRequest?: (signOut: () => void) => void }) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [confirmGuestExit, setConfirmGuestExit] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
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
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      } catch (error) {
        setSignOutError(error instanceof Error ? error.message : "Sign out failed. Please try again.");
      } finally {
        setSigningOut(false);
      }
    };
    if (onSignOutRequest) onSignOutRequest(() => { void signOut(); });
    else void signOut();
  }

  return (
    <div className="auth-slot">
      {user.user_metadata?.avatar_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="avatar" src={user.user_metadata.avatar_url} alt="" referrerPolicy="no-referrer" />
      )}
      <span className="auth-name">{name}</span>
      <button type="button" className="chip-button" disabled={signingOut} onClick={() => {
        if (user.is_anonymous) setConfirmGuestExit(true);
        else requestSignOut();
      }}>
        {signingOut ? "Signing out..." : "Sign out"}
      </button>
      {confirmGuestExit && (
        <div className="guest-signout-confirmation" role="group" aria-label="Confirm guest sign out">
          <p>Signing out permanently loses access to this guest&apos;s progress.</p>
          <button type="button" className="chip-button" onClick={() => setConfirmGuestExit(false)}>Cancel</button>{" "}
          <button type="button" className="primary" onClick={requestSignOut}>Sign out anyway</button>
        </div>
      )}
      {signOutError && <p className="status status-error" role="alert">{signOutError}</p>}
    </div>
  );
}
