"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MutableCategory } from "@/lib/notification-categories";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

const CATEGORIES = ["transport", "flight", "approval", "general"];

/** Set the signed-in user's in-app / push / email preference for a category. */
export async function setNotificationPref(
  category: MutableCategory,
  channel: "in_app" | "push" | "email",
  enabled: boolean,
): Promise<ActionResult> {
  if (!CATEGORIES.includes(category)) return { ok: false, error: "Unknown category." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      profile_id: user.id,
      category,
      [channel]: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,category" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/account");
  return { ok: true };
}
