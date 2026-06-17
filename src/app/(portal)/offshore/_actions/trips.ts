"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/types/actions";
import { requireOffshore, rev } from "./_shared";

export async function requestOffshoreTrip(input: {
  installationId: string;
  mobilizeDate: string;
  demobDate?: string;
}): Promise<ActionResult> {
  const gate = await requireOffshore("create");
  if (gate) return gate;
  if (!input.mobilizeDate) return { ok: false, error: "Mobilise date is required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("offshore_trips").insert({
    tenant_id: tenant.id,
    installation_id: input.installationId || null,
    mobilize_date: input.mobilizeDate,
    demob_date: input.demobDate || null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/**
 * Raise ONE offshore trip request covering several people at once. Any signed-in
 * user may book colleagues (e.g. a focal point mobilising their whole team); the
 * self-only insert policy is bypassed with the service-role client AFTER every
 * selected person is verified to belong to the caller's own tenant.
 */
export async function requestOffshoreTripGroup(input: {
  installationId: string;
  mobilizeDate: string;
  demobDate?: string;
  /**
   * People on the trip. Each entry is either an existing employee (profileId)
   * or an ad-hoc free-text name (name) for someone not in the directory.
   */
  people: { profileId?: string | null; name?: string | null }[];
}): Promise<ActionResult> {
  const gate = await requireOffshore("create");
  if (gate) return gate;
  if (!input.mobilizeDate) return { ok: false, error: "Mobilise date is required." };

  // Split the entries into employee ids and free-text names.
  const ids = [...new Set((input.people ?? []).map((p) => p.profileId).filter(Boolean) as string[])];
  const names = [
    ...new Map(
      (input.people ?? [])
        .filter((p) => !p.profileId && p.name?.trim())
        .map((p) => [p.name!.trim().toLowerCase(), p.name!.trim()] as const),
    ).values(),
  ];
  if (ids.length === 0 && names.length === 0) {
    return { ok: false, error: "Add at least one person." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: me } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = me?.tenant_id as string | undefined;
  if (!tenantId) return { ok: false, error: "No tenant in scope." };

  const adminCli = createAdminClient();
  if (!adminCli) return { ok: false, error: "Server is missing the service-role key." };

  // Only keep employee ids that really belong to the caller's tenant.
  let validIds: string[] = [];
  if (ids.length > 0) {
    const { data: people } = await adminCli
      .from("profiles")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    validIds = (people ?? []).map((p) => p.id as string);
  }
  if (validIds.length === 0 && names.length === 0) {
    return { ok: false, error: "No valid people in your organisation." };
  }

  const base = {
    tenant_id: tenantId,
    requester_id: user.id,
    installation_id: input.installationId || null,
    mobilize_date: input.mobilizeDate,
    demob_date: input.demobDate || null,
  };
  const rows = [
    ...validIds.map((pid) => ({ ...base, profile_id: pid })),
    ...names.map((person_name) => ({ ...base, profile_id: null, person_name })),
  ];

  const { error } = await adminCli.from("offshore_trips").insert(rows);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function clearHse(id: string): Promise<ActionResult> {
  const gate = await requireOffshore("approve");
  if (gate) return gate;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("offshore_trips")
    .update({
      status: "hse_cleared",
      hse_cleared_at: new Date().toISOString(),
      hse_cleared_by: user?.id ?? null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function assignManifest(
  id: string,
  flightId: string | null,
  bedNo: string | null,
): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase
    .from("offshore_trips")
    .update({ flight_id: flightId, bed_no: bedNo, status: "manifested" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
  rev();
  return { ok: true };
}

export async function setOffshoreStatus(
  id: string,
  status: "onboard" | "demobilised" | "cancelled",
): Promise<ActionResult> {
  const gate = await requireOffshore("approve");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("offshore_trips").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
  rev();
  return { ok: true };
}

export async function addFlight(input: {
  flightDate: string;
  route: string;
  seats: number;
}): Promise<ActionResult> {
  const gate = await requireOffshore("manage");
  if (gate) return gate;
  if (!input.route.trim() || !input.flightDate)
    return { ok: false, error: "Route and date are required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("helicopter_flights").insert({
    tenant_id: tenant.id,
    flight_date: input.flightDate,
    route: input.route.trim(),
    seats: Math.max(1, Math.floor(input.seats || 12)),
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
