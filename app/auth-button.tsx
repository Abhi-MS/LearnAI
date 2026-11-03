"use client";

import React, { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../lib/supabase-browser";

export default function AuthButton() {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

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

  const name = user.user_metadata?.full_name ?? user.email;
  return (
    <div className="auth-slot">
      {user.user_metadata?.avatar_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="avatar" src={user.user_metadata.avatar_url} alt="" referrerPolicy="no-referrer" />
      )}
      <span className="auth-name">{name}</span>
      <button type="button" className="chip-button" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </div>
  );
}
