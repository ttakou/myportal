"use server";

import { createClient } from "@/lib/supabase/server";
import { getMealSheet } from "@/lib/offshore";
import type { ActionResult } from "@/types/actions";
import type { MealEntry } from "@/types/offshore";
import { buildMealSheet } from "@/lib/offshore/meal-sheet-run";
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
 * for everyone else — and any casual diner — are kept. The caterer's own staff
 * (Pellegrini) come last with no meal ticked.
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

  const res = await buildMealSheet(supabase, tenant, installationId, date);
  if (!res.ok) return res;
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
