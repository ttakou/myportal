"use server";

import { createClient } from "@/lib/supabase/server";
import { getMealSheet } from "@/lib/offshore";
import type { ActionResult } from "@/types/actions";
import type { MealEntry } from "@/types/offshore";
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
 * Build the meal sheet for an installation + date from POB. Existing rows are
 * kept (manual edits preserved); missing people are added with defaults that
 * skip breakfast/snack on their arrival day and lunch/dinner/lodging on their
 * departure day.
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

  const [{ data: trips }, { data: visits }] = await Promise.all([
    // Everyone on board, not only those whose trip records an installation.
    // Most trips carry none - 94 of 156 in production - and filtering on it
    // strictly left the majority of POB off the sheet entirely. Someone whose
    // installation was never recorded is still aboard and still eats; the
    // filtering happens below so they can be included deliberately.
    supabase
      .from("offshore_trips")
      .select(
        "mobilize_date, demob_date, installation_id, person:profiles!offshore_trips_profile_id_fkey(full_name, email)",
      )
      .eq("status", "onboard")
      .lte("mobilize_date", date),
    // Approved as well as on board: a visitor with no bed yet is still offshore
    // and still eats. Excluding them starved anyone the Campboss had not
    // allocated a room to. One there by mistake is demobbed from the dashboard
    // queue, which is cheaper than missing a meal.
    supabase
      .from("offshore_visit_requests")
      .select("visitor_name, depart_date, return_date, status, installation_id")
      .in("status", ["onboard", "approved"])
      .lte("depart_date", date),
  ]);

  type Row = { name: string; category: "staff" | "visitor"; arrival: boolean; departure: boolean };
  const people: Row[] = [];
  for (const t of trips ?? []) {
    if (t.demob_date && (t.demob_date as string) < date) continue;
    // On this installation, or on none at all — never on a different one.
    const tripInstallation = (t.installation_id as string | null) ?? null;
    if (tripInstallation && tripInstallation !== installationId) continue;
    const p = Array.isArray(t.person) ? t.person[0] : t.person;
    people.push({
      name: (p?.full_name as string) || (p?.email as string) || "Crew",
      category: "staff",
      arrival: t.mobilize_date === date,
      departure: t.demob_date === date,
    });
  }
  for (const v of visits ?? []) {
    if (v.return_date && (v.return_date as string) < date) continue;
    const visitInstallation = (v.installation_id as string | null) ?? null;
    if (visitInstallation && visitInstallation !== installationId) continue;
    people.push({
      name: v.visitor_name as string,
      category: "visitor",
      arrival: v.depart_date === date,
      departure: v.return_date === date,
    });
  }

  if (people.length === 0) return { ok: false, error: "No one is on board for that date yet." };

  const rows = people.map((p) => ({
    tenant_id: tenant,
    installation_id: installationId,
    meal_date: date,
    person_name: p.name,
    category: p.category,
    breakfast: !p.arrival,
    snack: !p.arrival,
    lunch: !p.departure,
    dinner: !p.departure,
    lodging: !p.departure,
  }));

  // Add missing people only — keep any manual edits already on the sheet.
  const { error } = await supabase
    .from("offshore_meal_entries")
    .upsert(rows, { onConflict: "installation_id,meal_date,person_name", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
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
