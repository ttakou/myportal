"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";
import type { TripMode } from "@/types/offshore";
import type { NightlyMode } from "@/lib/offshore/schedule-settings";
import { getAccess } from "@/lib/auth";
import { rev } from "./_shared";

/** The two schedule switches are the admins' (tenant or system admin) alone. */
async function adminOnly(): Promise<ActionResult | null> {
  const a = await getAccess();
  return a.isAdmin || a.isSystemAdmin ? null : { ok: false, error: "Only an admin can change this setting." };
}

/**
 * Set the tenant's default crew-change mode ('auto' | 'manual'), stored on the
 * offshore module's tenant_services.settings. Admins only. The tightly-scoped RLS policy on tenant_services already lets
 * them write the offshore row for their own tenant.
 */
export async function setOffshoreDefaultMode(mode: TripMode): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  if (mode !== "auto" && mode !== "manual") return { ok: false, error: "Invalid mode." };

  const supabase = createClient();
  const { data: row } = await supabase
    .from("tenant_services")
    .select("id, settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "offshore")
    .maybeSingle();
  if (!row) return { ok: false, error: "Offshore module is not enabled." };

  const settings = {
    ...((row.settings ?? {}) as Record<string, unknown>),
    default_crew_change_mode: mode,
  };
  const { error } = await supabase
    .from("tenant_services")
    .update({ settings })
    .eq("id", row.id);
  if (error) return { ok: false, error: error.message };

  rev();
  return { ok: true };
}

/**
 * Whether the nightly job may open crew changes itself ("act") or only prompt
 * and remind ("prompt"). Confirmed in the UI before it is called with "act":
 * from then on the schedule boards and demobilises crews with nobody
 * pressing a button. Same guard and storage as the default mode.
 */
export async function setOffshoreNightly(nightly: NightlyMode): Promise<ActionResult> {
  const denied = await adminOnly();
  if (denied) return denied;
  if (nightly !== "act" && nightly !== "prompt") return { ok: false, error: "Invalid setting." };

  const supabase = createClient();
  const { data: row } = await supabase
    .from("tenant_services")
    .select("id, settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "offshore")
    .maybeSingle();
  if (!row) return { ok: false, error: "Offshore module is not enabled." };

  const settings = {
    ...((row.settings ?? {}) as Record<string, unknown>),
    nightly_crew_changes: nightly,
  };
  const { error } = await supabase.from("tenant_services").update({ settings }).eq("id", row.id);
  if (error) return { ok: false, error: error.message };

  rev();
  return { ok: true };
}
