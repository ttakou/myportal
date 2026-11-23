import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth";
import { GROUP_MODULES, type NoticeGroup } from "@/lib/notification-groups";

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
  /** The module it comes from (offshore, performance, transportation…). */
  module: string | null;
  /** A decision's deadline, when it asks for one. */
  due_at: string | null;
}

export interface NotificationFeed {
  items: AppNotification[];
  unread: number;
  /** Unread per bell tab. */
  unreadByGroup: Record<NoticeGroup, number>;
  /** Unread decisions whose deadline is still ahead — pinned on top. */
  due: AppNotification[];
}

const COLS = "id, category, title, body, url, read_at, created_at, module, due_at";
const KNOWN = Object.values(GROUP_MODULES).flat();
/** A PostgREST `or` filter selecting one bell tab's notices. */
export function groupFilter(g: NoticeGroup): string {
  return g === "other"
    ? `module.is.null,module.not.in.(${KNOWN.join(",")})`
    : `module.in.(${GROUP_MODULES[g].join(",")})`;
}

const EMPTY_GROUPS: Record<NoticeGroup, number> = { offshore: 0, performance: 0, transport: 0, other: 0 };

/**
 * The signed-in user's recent notifications (optionally one bell tab), the
 * unread count overall and per tab, and the decisions still due (RLS-scoped).
 */
export async function getMyNotifications(limit = 30, group: NoticeGroup | "all" = "all"): Promise<NotificationFeed> {
  const user = await getCachedUser();
  if (!user) return { items: [], unread: 0, unreadByGroup: { ...EMPTY_GROUPS }, due: [] };

  const supabase = createClient();
  let list = supabase.from("notifications").select(COLS).order("created_at", { ascending: false }).limit(limit);
  if (group !== "all") list = list.or(groupFilter(group));
  const unreadIn = (g: NoticeGroup) =>
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).or(groupFilter(g));

  const [{ data }, { count }, off, perf, trans, other, { data: due }] = await Promise.all([
    list,
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    unreadIn("offshore"),
    unreadIn("performance"),
    unreadIn("transport"),
    unreadIn("other"),
    supabase
      .from("notifications")
      .select(COLS)
      .is("read_at", null)
      .gt("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(10),
  ]);

  return {
    items: (data ?? []) as AppNotification[],
    unread: count ?? 0,
    unreadByGroup: {
      offshore: off.count ?? 0,
      performance: perf.count ?? 0,
      transport: trans.count ?? 0,
      other: other.count ?? 0,
    },
    due: (due ?? []) as AppNotification[],
  };
}
