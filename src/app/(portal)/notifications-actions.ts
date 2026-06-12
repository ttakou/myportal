"use server";

import { createClient } from "@/lib/supabase/server";
import { getMyNotifications, type NotificationFeed } from "@/lib/notifications";

/** Poll endpoint for the notification bell. */
export async function fetchMyNotifications(): Promise<NotificationFeed> {
  return getMyNotifications();
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
