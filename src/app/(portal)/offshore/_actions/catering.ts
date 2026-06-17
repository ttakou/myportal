"use server";

import { createClient } from "@/lib/supabase/server";
import { getMealSheet } from "@/lib/offshore";
import type { ActionResult } from "@/types/actions";
import type { MealEntry } from "@/types/offshore";
import { canManageCatering, rev, tenantId } from "./_shared";

/** Read the saved meal sheet (server-action wrapper for client date switching). */
export async function fetchMealSheet(
  installationId: string,
  date: string,
): Promise<{ ok: boolean; entries?: MealEntry[]; error?: string }> {
  if (!(await canManageCatering())) return { ok: false, error: "Not authorized." };
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
  if (!(await canManageCatering())) return { ok: false, error: "Not authorized." };
  if (!installationId || !date) return { ok: false, error: "Installation and date are required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const [{ data: trips }, { data: visits }] = await Promise.all([
    supabase
      .from("offshore_trips")
      .select("mobilize_date, demob_date, person:profiles!offshore_trips_profile_id_fkey(full_name, email)")
      .eq("installation_id", installationId)
      .eq("status", "onboard")
      .lte("mobilize_date", date),
    supabase
      .from("offshore_visit_requests")
      .select("visitor_name, depart_date, return_date")
      .eq("installation_id", installationId)
      .eq("status", "onboard")
      .lte("depart_date", date),
  ]);

  type Row = { name: string; category: "staff" | "visitor"; arrival: boolean; departure: boolean };
  const people: Row[] = [];
  for (const t of trips ?? []) {
    if (t.demob_date && (t.demob_date as string) < date) continue;
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
  if (!(await canManageCatering())) return { ok: false, error: "Not authorized." };
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
  if (!(await canManageCatering())) return { ok: false, error: "Not authorized." };
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
  if (!(await canManageCatering())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase.from("offshore_meal_entries").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
