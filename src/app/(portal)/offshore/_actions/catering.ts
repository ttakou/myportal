"use server";

import { createClient } from "@/lib/supabase/server";
import { getMealSheet } from "@/lib/offshore";
import type { ActionResult } from "@/types/actions";
import type { MealEntry } from "@/types/offshore";
import { aboardOn, syncMealSheet, type SavedEntry } from "@/lib/offshore/meal-sheet";
import { requireOffshoreCatering, rev, tenantId } from "./_shared";

/** Read the saved meal sheet (server-action wrapper for client date switching). */
export async function fetchMealSheet(
  installationId: string,
  date: string,
): Promise<{ ok: boolean; entries?: MealEntry[]; error?: string }> {
  const gate = await requireOffshoreCatering("view");
  if (gate) return gate;
  return { ok: true, entries: await getMealSheet(installationId, date) };
}

/**
 * Build the meal sheet for an installation + date from POB.
 *
 * The first generation lists everyone on board with every meal ticked; the
 * catering desk unticks what was not served. Generating again brings the sheet
 * back in line with POB: whoever has boarded since is added (every meal
 * ticked), whoever is no longer on board is dropped, and the ticks already set
 * for everyone else — and any casual diner — are kept.
 */
export async function generateMealSheet(
  installationId: string,
  date: string,
): Promise<ActionResult> {
  const gate = await requireOffshoreCatering("operate");
  if (gate) return gate;
  if (!installationId || !date) return { ok: false, error: "Installation and date are required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const [{ data: trips, error: tripErr }, { data: visits, error: visitErr }, { data: saved, error: savedErr }] =
    await Promise.all([
      // Everyone on board, not only those whose trip records an installation
      // (most carry none); demobilised trips too, so a past day can be rebuilt.
      supabase
        .from("offshore_trips")
        .select(
          "status, mobilize_date, demob_date, installation_id, person:profiles!offshore_trips_profile_id_fkey(full_name, email)",
        )
        .in("status", ["onboard", "demobilised"])
        .lte("mobilize_date", date),
      // Approved as well as on board: a visitor with no bed yet still eats.
      supabase
        .from("offshore_visit_requests")
        .select("visitor_name, depart_date, return_date, status, installation_id")
        .in("status", ["onboard", "approved", "returned"])
        .lte("depart_date", date),
      supabase
        .from("offshore_meal_entries")
        .select("id, person_name, category")
        .eq("installation_id", installationId)
        .eq("meal_date", date),
    ]);
  const readErr = tripErr ?? visitErr ?? savedErr;
  if (readErr) return { ok: false, error: readErr.message };

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
  if (aboard.length === 0 && (saved ?? []).length === 0) {
    return { ok: false, error: "No one is on board for that date yet." };
  }

  const { add, removeIds } = syncMealSheet((saved ?? []) as SavedEntry[], aboard);
  if (removeIds.length) {
    const { error } = await supabase.from("offshore_meal_entries").delete().in("id", removeIds);
    if (error) return { ok: false, error: error.message };
  }
  if (add.length) {
    const rows = add.map((p) => ({
      tenant_id: tenant,
      installation_id: installationId,
      meal_date: date,
      person_name: p.name,
      category: p.category,
      breakfast: true,
      snack: true,
      lunch: true,
      dinner: true,
      lodging: true,
    }));
    const { error } = await supabase
      .from("offshore_meal_entries")
      .upsert(rows, { onConflict: "installation_id,meal_date,person_name", ignoreDuplicates: true });
    if (error) return { ok: false, error: error.message };
  }
  rev();
  return { ok: true };
}

export async function updateMealEntry(input: {
  id: string;
  breakfast?: boolean;
  snack?: boolean;
  lunch?: boolean;
  dinner?: boolean;
  lodging?: boolean;
}): Promise<ActionResult> {
  const gate = await requireOffshoreCatering("operate");
  if (gate) return gate;
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  for (const k of ["breakfast", "snack", "lunch", "dinner", "lodging"] as const) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  const { error } = await supabase.from("offshore_meal_entries").update(patch).eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function addCasualMeal(input: {
  installationId: string;
  date: string;
  personName: string;
}): Promise<ActionResult> {
  const gate = await requireOffshoreCatering("operate");
  if (gate) return gate;
  if (!input.personName.trim()) return { ok: false, error: "Name is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("offshore_meal_entries").insert({
    tenant_id: tenant,
    installation_id: input.installationId,
    meal_date: input.date,
    person_name: input.personName.trim(),
    category: "casual",
  });
  if (error)
    return {
      ok: false,
      error: error.message.includes("duplicate") ? "That name is already on the sheet." : error.message,
    };
  rev();
  return { ok: true };
}

export async function removeMealEntry(id: string): Promise<ActionResult> {
  const gate = await requireOffshoreCatering("operate");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("offshore_meal_entries").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
