import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for trusted server-side tasks that must bypass
 * RLS — e.g. fanning an emergency alert out to other users' push subscriptions.
 *
 * NEVER import this into client code or expose the key to the browser. Returns
 * null when the service-role key isn't configured so callers can degrade
 * gracefully instead of throwing.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
