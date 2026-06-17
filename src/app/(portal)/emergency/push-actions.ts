"use server";

import { createClient } from "@/lib/supabase/server";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

/** Register (or refresh) a browser push subscription for the signed-in user. */
export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<ActionResult> {
  if (!input.endpoint || !input.p256dh || !input.auth) {
    return { ok: false, error: "Incomplete subscription." };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase.from("eess_push_subscriptions").upsert(
    {
      profile_id: user.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent?.slice(0, 300) ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Remove a push subscription (the user opted out on this device). */
export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  if (!endpoint) return { ok: false, error: "Missing endpoint." };
  const supabase = createClient();
  const { error } = await supabase
    .from("eess_push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
