import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  defaultPrefs,
  type MutableCategory,
  type PrefMap,
} from "@/lib/notification-categories";

export type { MutableCategory, PrefMap, CategoryPref } from "@/lib/notification-categories";
export { MUTABLE_CATEGORIES } from "@/lib/notification-categories";

/** The signed-in user's preferences, defaulted to all-on. */
export async function getMyNotificationPrefs(): Promise<PrefMap> {
  const supabase = createClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select("category, in_app, push");
  const out = defaultPrefs();
  for (const row of data ?? []) {
    if (row.category in out) {
      out[row.category as MutableCategory] = { in_app: row.in_app, push: row.push };
    }
  }
  return out;
}

/**
 * For the notify pipeline (service role): given recipients and a category,
 * return the subsets that want in-app and push respectively. Emergency (and any
 * non-mutable category) is delivered to everyone.
 */
export async function filterByPreference(
  admin: SupabaseClient,
  profileIds: string[],
  category: string,
): Promise<{ inApp: string[]; push: string[] }> {
  const mutable = ["transport", "flight", "approval", "general"].includes(category);
  if (!mutable || profileIds.length === 0) {
    return { inApp: profileIds, push: profileIds };
  }
  const { data } = await admin
    .from("notification_preferences")
    .select("profile_id, in_app, push")
    .eq("category", category)
    .in("profile_id", profileIds);

  const muteInApp = new Set<string>();
  const mutePush = new Set<string>();
  for (const row of data ?? []) {
    if (row.in_app === false) muteInApp.add(row.profile_id as string);
    if (row.push === false) mutePush.add(row.profile_id as string);
  }
  return {
    inApp: profileIds.filter((id) => !muteInApp.has(id)),
    push: profileIds.filter((id) => !mutePush.has(id)),
  };
}
