import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Modules every onshore staff member gets as a baseline, regardless of the
 * access roles assigned to them. These are the day-to-day services an onshore
 * worker is expected to reach from their dashboard (the "Quick access" view):
 * emergency support, canteen, transport requests and visitor management.
 *
 * Baseline access still respects the tenant's subscriptions — a tenant that has
 * not switched a module on won't expose it — it only bypasses the per-user
 * access-role narrowing.
 */
export const BASELINE_ONSHORE_SLUGS = [
  "emergency",
  "canteen",
  "transportation",
  "visitors",
] as const;

export function isBaselineOnshoreSlug(slug: string): boolean {
  return (BASELINE_ONSHORE_SLUGS as readonly string[]).includes(slug);
}

/**
 * A user is "offshore" when they have a permanent offshore roster row, or any
 * non-cancelled offshore trip. Otherwise they are treated as onshore. This
 * mirrors the dashboard's own onshore/offshore split.
 *
 * Best-effort: on any query error we fall back to onshore (the permissive side),
 * so a transient failure never strands a worker without their baseline modules.
 */
export async function isOffshoreUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  try {
    const [{ count: staffCount }, { count: tripCount }] = await Promise.all([
      supabase
        .from("offshore_staff")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", userId),
      supabase
        .from("offshore_trips")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", userId)
        .neq("status", "cancelled"),
    ]);
    return (staffCount ?? 0) > 0 || (tripCount ?? 0) > 0;
  } catch {
    return false;
  }
}
