import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aboardOn, startingMeals, syncMealSheet, type SavedEntry } from "./meal-sheet";
import { siteToday } from "./manifest-order";

/**
 * Generate (or bring up to date) one installation's meal sheet for a day,
 * from POB. Used by the catering desk's button and by the nightly job, so
 * every read names the tenant: the job runs on the service role.
 *
 * Arrivals and leavers that day are marked and start with their day's ticks.
 * When someone's day changes after the sheet was made (run postponed, a
 * no-show), their row is re-marked and, for today or later, re-ticked; a
 * past day keeps the canteen's ticks and only gets the new mark.
 */
export async function buildMealSheet(
  client: SupabaseClient,
  tenantId: string,
  installationId: string,
  date: string,
): Promise<{ ok: true; added: number; removed: number; total: number } | { ok: false; error: string }> {
  const [{ data: trips, error: tripErr }, { data: visits, error: visitErr }, { data: saved, error: savedErr }, { data: staff, error: staffErr }] =
    await Promise.all([
      // Everyone on board, not only those whose trip records an installation
      // (most carry none); demobilised trips too, so a past day can be rebuilt.
      client
        .from("offshore_trips")
        .select("profile_id, status, mobilize_date, demob_date, installation_id, person:profiles!offshore_trips_profile_id_fkey(full_name, email)")
        .eq("tenant_id", tenantId)
        .in("status", ["onboard", "demobilised"])
        .lte("mobilize_date", date),
      // Approved as well as on board: a visitor with no bed yet still eats.
      client
        .from("offshore_visit_requests")
        .select("visitor_name, depart_date, return_date, status, installation_id")
        .eq("tenant_id", tenantId)
        .in("status", ["onboard", "approved", "returned"])
        .lte("depart_date", date),
      client
        .from("offshore_meal_entries")
        .select("id, person_name, category, movement")
        .eq("tenant_id", tenantId)
        .eq("installation_id", installationId)
        .eq("meal_date", date),
      client.from("offshore_staff").select("profile_id, company").eq("tenant_id", tenantId),
    ]);
  const readErr = tripErr ?? visitErr ?? savedErr ?? staffErr;
  if (readErr) return { ok: false, error: readErr.message };

  const companyOf = new Map(((staff ?? []) as { profile_id: string; company: string | null }[]).map((s) => [s.profile_id, s.company]));
  const aboard = aboardOn(
    date,
    installationId,
    (trips ?? []).map((t) => {
      const p = Array.isArray(t.person) ? t.person[0] : t.person;
      return {
        name: (p?.full_name as string) || (p?.email as string) || "Crew",
        status: t.status as string,
        mobilize_date: t.mobilize_date as string,
        demob_date: (t.demob_date as string | null) ?? null,
        installation_id: (t.installation_id as string | null) ?? null,
        company: t.profile_id ? companyOf.get(t.profile_id as string) ?? null : null,
      };
    }),
    (visits ?? []).map((v) => ({
      name: v.visitor_name as string,
      status: v.status as string,
      depart_date: v.depart_date as string,
      return_date: (v.return_date as string | null) ?? null,
      installation_id: (v.installation_id as string | null) ?? null,
    })),
  );
  if (aboard.length === 0 && (saved ?? []).length === 0) return { ok: false, error: "No one is on board for that date yet." };

  const { add, removeIds, toCaterer, remark } = syncMealSheet((saved ?? []) as SavedEntry[], aboard);
  if (removeIds.length) {
    const { error } = await client.from("offshore_meal_entries").delete().in("id", removeIds);
    if (error) return { ok: false, error: error.message };
  }
  if (toCaterer.length) {
    const { error } = await client
      .from("offshore_meal_entries")
      .update({ category: "caterer", ...startingMeals("caterer") })
      .in("id", toCaterer);
    if (error) return { ok: false, error: error.message };
  }
  const reTick = date >= siteToday();
  for (const r of remark) {
    const { error } = await client
      .from("offshore_meal_entries")
      .update({ movement: r.movement, ...(reTick ? startingMeals(r.category, r.movement) : {}) })
      .eq("id", r.id);
    if (error) return { ok: false, error: error.message };
  }
  if (add.length) {
    const rows = add.map((p) => ({
      tenant_id: tenantId,
      installation_id: installationId,
      meal_date: date,
      person_name: p.name,
      category: p.category,
      movement: p.movement ?? null,
      ...startingMeals(p.category, p.movement ?? null),
    }));
    const { error } = await client
      .from("offshore_meal_entries")
      .upsert(rows, { onConflict: "installation_id,meal_date,person_name", ignoreDuplicates: true });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, added: add.length, removed: removeIds.length, total: (saved?.length ?? 0) + add.length - removeIds.length };
}

/**
 * Bring a day's saved sheets back in line after POB changed during the day
 * (a no-show, a traveller added, a run postponed). Only installations that
 * already have a sheet for that day; never fails the caller.
 */
export async function resyncDaySheets(client: SupabaseClient, tenantId: string, date: string): Promise<void> {
  try {
    const { data } = await client
      .from("offshore_meal_entries")
      .select("installation_id")
      .eq("tenant_id", tenantId)
      .eq("meal_date", date);
    const insts = new Set(((data ?? []) as { installation_id: string }[]).map((r) => r.installation_id));
    for (const inst of insts) {
      const res = await buildMealSheet(client, tenantId, inst, date);
      if (!res.ok) console.error(`meal sheet resync ${inst} ${date}: ${res.error}`);
    }
  } catch (e) {
    console.error("meal sheet resync failed:", (e as Error).message);
  }
}
