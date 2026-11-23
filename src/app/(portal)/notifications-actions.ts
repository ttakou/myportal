"use server";

import { createClient } from "@/lib/supabase/server";
import { getMyNotifications, groupFilter, type NotificationFeed } from "@/lib/notifications";
import type { NoticeGroup } from "@/lib/notification-groups";

const GROUPS = new Set(["all", "offshore", "performance", "transport", "other"]);

/** Poll endpoint for the notification bell (one tab, or all). */
export async function fetchMyNotifications(group: NoticeGroup | "all" = "all"): Promise<NotificationFeed> {
  return getMyNotifications(30, GROUPS.has(group) ? group : "all");
}

/** "Mark all read" for one tab only. */
export async function markGroupRead(group: NoticeGroup): Promise<{ ok: boolean }> {
  if (!GROUPS.has(group) || group === ("all" as string)) return { ok: false };
  const supabase = createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .or(groupFilter(group));
  return { ok: true };
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  const supabase = createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const supabase = createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  return { ok: true };
}
