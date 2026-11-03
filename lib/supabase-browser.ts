import { createBrowserClient } from "@supabase/ssr";

// Cookie-backed session client for auth; the existing lib/supabase.ts stays stateless
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Client components are also prerendered at build time; don't crash there if env is missing.
  if (typeof window === "undefined") {
    return createBrowserClient(url || "https://placeholder.supabase.co", key || "placeholder");
  }
  return createBrowserClient(url!, key!);
}
