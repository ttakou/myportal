import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who the performance workflow applies to, for one tenant.
 *
 * The appraisal rows in a cycle are not that set. Cycles launched under an
 * earlier, looser roster rule created rows for people who cannot open the
 * Performance module at all — they cannot act on them, cannot see them, and
 * should not be counted in a report or chased by a reminder.
 *
 * Takes the tenant explicitly because the nightly sweeps run as the service
 * role with no signed-in user, so the JWT-scoped `appraisable_profiles()` has
 * no tenant to resolve. Both call the same SQL definition underneath.
 */
export async function appraisableIdsForTenant(
  admin: SupabaseClient,
  tenantId: string,
): Promise<Set<string>> {
  const { data, error } = await admin.rpc("appraisable_profiles_for", { p_tenant: tenantId });
  if (error) {
    // An empty roster stops this tenant's reminders for the run. That is the
    // safer of the two failures — the alternative is skipping the filter and
    // mailing hundreds of people who cannot act on what they are sent — but it
    // is silent from the outside, so it must be logged loudly.
    console.error("appraisableIdsForTenant: roster lookup failed —", error.message);
    return new Set();
  }
  return new Set(((data ?? []) as { id: string }[]).map((p) => p.id));
}
