/**
 * lib/supabase.js — Singleton Supabase browser client.
 *
 * Uses ONLY the publishable (anon) key — safe to ship in the browser bundle.
 * The service-role/secret key lives ONLY in backend/.env and is never imported here.
 *
 * Import this singleton everywhere instead of calling createClient() directly.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.error(
    "[InfraDrishti] CRITICAL: Supabase environment variables missing. " +
      "Login and data persistence will not work.\n" +
      "Create frontend/.env.local with:\n" +
      "  VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co\n" +
      "  VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_..."
  );
}

export const supabase = createClient(
  supabaseUrl || "",
  supabasePublishableKey || "",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);
