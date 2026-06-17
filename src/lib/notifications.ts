import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth";

export type NotificationCategory =
  | "emergency"
  | "transport"
  | "flight"
  | "approval"
  | "general";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationFeed {
  items: AppNotification[];
  unread: number;
}

/** The signed-in user's recent notifications + unread count (RLS-scoped). */
export async function getMyNotifications(limit = 20): Promise<NotificationFeed> {
  const user = await getCachedUser();
  if (!user) return { items: [], unread: 0 };

  const supabase = createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, category, title, body, url, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  return { items: (data ?? []) as AppNotification[], unread: count ?? 0 };
}
