import { createBrowserClient } from "@supabase/ssr";

// Cookie-backed session client for auth; the existing lib/supabase.ts stays stateless
export function createSupabaseBrowserClient() {
  // Strip stray quotes/whitespace that sometimes end up in hosted env values
  const clean = (v?: string) => (v ?? "").trim().replace(/^["']|["']$/g, "");
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  // Client components are also prerendered at build time; don't crash there on bad env.
  if (typeof window === "undefined" && !/^https?:\/\//.test(url)) {
    return createBrowserClient("https://placeholder.supabase.co", key || "placeholder");
  }
  return createBrowserClient(url, key);
}
