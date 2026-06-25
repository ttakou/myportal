"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";
import { requireOffshore, rev, tenantId } from "./_shared";

/** Set/clear one evacuation or head-count role for a muster group in a window. */
export async function setEmergencyRole(input: {
  fromDate: string;
  toDate: string;
  lifeboat: string;
  role: "evac_leader" | "evac_assistant" | "headcount_principal" | "headcount_assistant";
  profileId: string | null;
}): Promise<ActionResult> {
  const gate = await requireOffshore("manage");
  if (gate) return gate;
  if (!input.fromDate || !input.toDate) return { ok: false, error: "Rotation window dates are required." };
  if (!input.lifeboat) return { ok: false, error: "Muster group is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  if (!input.profileId) {
    const { error } = await supabase
      .from("offshore_emergency_roles")
      .delete()
      .eq("tenant_id", tenant)
      .eq("from_date", input.fromDate)
      .eq("to_date", input.toDate)
      .eq("lifeboat", input.lifeboat)
      .eq("role", input.role);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("offshore_emergency_roles").upsert(
      {
        tenant_id: tenant,
        from_date: input.fromDate,
        to_date: input.toDate,
        lifeboat: input.lifeboat,
        role: input.role,
        profile_id: input.profileId,
      },
      { onConflict: "tenant_id,from_date,to_date,lifeboat,role" },
    );
    if (error) return { ok: false, error: error.message };
  }
  rev();
  return { ok: true };
}

/** Add one person to an emergency response team (HLO / fire team) for a window. Teams are unlimited. */
export async function addEmergencyTeamMember(input: {
  fromDate: string;
  toDate: string;
  team: "hlo" | "fire_team";
  profileId: string;
}): Promise<ActionResult> {
  const gate = await requireOffshore("manage");
  if (gate) return gate;
  if (!input.fromDate || !input.toDate) return { ok: false, error: "Rotation window dates are required." };
  if (!input.profileId) return { ok: false, error: "Select a person to add." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  // Ignore duplicates — the same person can't be added to a team twice in a window.
  const { error } = await supabase.from("offshore_emergency_teams").upsert(
    {
      tenant_id: tenant,
      from_date: input.fromDate,
      to_date: input.toDate,
      team: input.team,
      profile_id: input.profileId,
    },
    { onConflict: "tenant_id,from_date,to_date,team,profile_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Remove one emergency team member by row id. */
export async function removeEmergencyTeamMember(id: string): Promise<ActionResult> {
  const gate = await requireOffshore("manage");
  if (gate) return gate;
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase
    .from("offshore_emergency_teams")
    .delete()
    .eq("tenant_id", tenant)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Remove every role row for a rotation window. */
export async function deleteEmergencyWindow(fromDate: string, toDate: string): Promise<ActionResult> {
  const gate = await requireOffshore("manage");
  if (gate) return gate;
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase
    .from("offshore_emergency_roles")
    .delete()
    .eq("tenant_id", tenant)
    .eq("from_date", fromDate)
    .eq("to_date", toDate);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
