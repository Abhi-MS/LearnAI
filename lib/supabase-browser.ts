import { createBrowserClient } from "@supabase/ssr";

// Cookie-backed session client for auth; the existing lib/supabase.ts stays stateless
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
