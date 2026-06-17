"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";
import { requireOffshore, rev, tenantId } from "./_shared";
import { boardMember } from "./mobilise";

/**
 * Generate the crew manifest for the crew's *next* computed change date,
 * derived from its rotation cycle. Outbound = crew going offshore.
 */
export async function generateNextCrewChange(
  crewId: string,
  direction: "out" | "in",
): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const { data: crew } = await supabase
    .from("offshore_crews")
    .select("offshore_days, onshore_days, cycle_start_date")
    .eq("id", crewId)
    .maybeSingle();
  if (!crew) return { ok: false, error: "Crew not found." };
  if (!crew.cycle_start_date)
    return { ok: false, error: "Set the crew's cycle start date first." };

  const period = (crew.offshore_days as number) + (crew.onshore_days as number);
  const DAY = 86_400_000;
  const start = new Date((crew.cycle_start_date as string) + "T00:00:00Z").getTime();
  const now = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  let base = start;
  if (now > start) base = start + Math.ceil((now - start) / (period * DAY)) * period * DAY;
  // Inbound (crew returning) falls offshore_days after they went out.
  const target =
    direction === "in" ? base - (crew.onshore_days as number) * DAY : base;
  const scheduledDate = new Date(target).toISOString().slice(0, 10);
  return generateCrewManifest({ crewId, direction, scheduledDate });
}

/**
 * Build a manifest from a hand-picked passenger list and a transport mode
 * (helicopter or boat). Crew is optional — a movement can mix people.
 */
export async function createManifest(input: {
  crewId?: string | null;
  direction: "out" | "in";
  transportMode: string; // "helicopter" | "boat"
  scheduledDate: string;
  seatCapacity: number;
  profileIds: string[];
  visitRequestIds?: string[];
}): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  if (!input.scheduledDate) return { ok: false, error: "Scheduled date is required." };
  const visitorIds = input.visitRequestIds ?? [];
  if (!input.profileIds.length && !visitorIds.length)
    return { ok: false, error: "Select at least one passenger." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  let crewName = "Movement";
  let installationId: string | null = null;
  if (input.crewId) {
    const { data: crew } = await supabase
      .from("offshore_crews")
      .select("name, installation_id")
      .eq("id", input.crewId)
      .maybeSingle();
    if (crew) {
      crewName = crew.name as string;
      installationId = (crew.installation_id as string | null) ?? null;
    }
  }
  const modeLabel = input.transportMode === "boat" ? "boat" : "helicopter";

  const { data: manifest, error } = await supabase
    .from("offshore_manifests")
    .insert({
      tenant_id: tenant,
      title: `${crewName} · ${input.direction === "out" ? "inbound" : "outbound"} · ${modeLabel} · ${input.scheduledDate}`,
      crew_id: input.crewId || null,
      installation_id: installationId,
      trip_type: input.direction === "out" ? "crew_change_out" : "crew_change_in",
      direction: input.direction,
      transport_mode: modeLabel,
      seat_capacity: Math.max(1, Math.floor(input.seatCapacity || input.profileIds.length + visitorIds.length)),
      scheduled_date: input.scheduledDate,
    })
    .select("id")
    .maybeSingle();
  if (error || !manifest) return { ok: false, error: error?.message ?? "Could not create manifest." };

  const { data: people } = await supabase
    .from("offshore_staff")
    .select("profile_id, position, company, profile:profiles!offshore_staff_profile_id_fkey(full_name, email)")
    .in("profile_id", input.profileIds);
  const byId = new Map<string, Record<string, any>>();
  for (const s of people ?? []) byId.set(s.profile_id as string, s);
  // Fall back to profiles for anyone not on the roster.
  const missing = input.profileIds.filter((id) => !byId.has(id));
  if (missing.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", missing);
    for (const p of profs ?? [])
      byId.set(p.id as string, { profile_id: p.id, profile: { full_name: p.full_name, email: p.email } });
  }

  const pax: Record<string, unknown>[] = input.profileIds.map((id) => {
    const s = byId.get(id);
    const p = s ? (Array.isArray(s.profile) ? s.profile[0] : s.profile) : null;
    return {
      tenant_id: tenant,
      manifest_id: manifest.id,
      profile_id: id,
      person_name: p?.full_name || p?.email || "Passenger",
      position: s?.position ?? null,
    };
  });

  if (visitorIds.length) {
    const { data: visits } = await supabase
      .from("offshore_visit_requests")
      .select("id, visitor_name, visitor_company")
      .in("id", visitorIds);
    const vById = new Map<string, Record<string, any>>();
    for (const v of visits ?? []) vById.set(v.id as string, v);
    for (const id of visitorIds) {
      const v = vById.get(id);
      pax.push({
        tenant_id: tenant,
        manifest_id: manifest.id,
        visit_request_id: id,
        person_name: (v?.visitor_name as string) || "Visitor",
        position: (v?.visitor_company as string) ?? "Visitor",
      });
    }
  }
  await supabase.from("offshore_manifest_pax").insert(pax);
  rev();
  return { ok: true };
}

export async function generateCrewManifest(input: {
  crewId: string;
  direction: "out" | "in";
  scheduledDate: string;
}): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  if (!input.scheduledDate) return { ok: false, error: "Scheduled date is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { data: crew } = await supabase
    .from("offshore_crews")
    .select("name, installation_id, transport_mode")
    .eq("id", input.crewId)
    .maybeSingle();
  if (!crew) return { ok: false, error: "Crew not found." };

  const { data: members } = await supabase
    .from("offshore_staff")
    .select("profile_id, position, profile:profiles!offshore_staff_profile_id_fkey(full_name, email)")
    .eq("crew_id", input.crewId);
  if (!members || members.length === 0) return { ok: false, error: "This crew has no members." };

  const { data: manifest, error } = await supabase
    .from("offshore_manifests")
    .insert({
      tenant_id: tenant,
      title: `${crew.name} · ${input.direction === "out" ? "inbound" : "outbound"} · ${input.scheduledDate}`,
      crew_id: input.crewId,
      installation_id: crew.installation_id,
      trip_type: input.direction === "out" ? "crew_change_out" : "crew_change_in",
      direction: input.direction,
      transport_mode: crew.transport_mode,
      // Size the manifest to the whole crew (a crew change may span several
      // transport runs); keep at least a helicopter's 12.
      seat_capacity: Math.max(12, members.length),
      scheduled_date: input.scheduledDate,
    })
    .select("id")
    .maybeSingle();
  if (error || !manifest) return { ok: false, error: error?.message ?? "Could not create manifest." };

  const pax = members.map((m: Record<string, any>) => {
    const p = Array.isArray(m.profile) ? m.profile[0] : m.profile;
    return {
      tenant_id: tenant,
      manifest_id: manifest.id,
      profile_id: m.profile_id,
      person_name: p?.full_name || p?.email || "Crew member",
      position: m.position,
    };
  });
  await supabase.from("offshore_manifest_pax").insert(pax);
  rev();
  return { ok: true };
}

export async function setManifestStatus(
  id: string,
  status: "draft" | "approved" | "locked" | "cancelled",
): Promise<ActionResult> {
  const gate = await requireOffshore("approve");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("offshore_manifests").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Adjust an existing manifest's transport mode and/or seat capacity. */
export async function updateManifestTransport(input: {
  id: string;
  transportMode?: "helicopter" | "boat";
  seatCapacity?: number;
}): Promise<ActionResult> {
  const gate = await requireOffshore("edit");
  if (gate) return gate;
  const patch: Record<string, unknown> = {};
  if (input.transportMode === "helicopter" || input.transportMode === "boat") {
    patch.transport_mode = input.transportMode;
  }
  if (input.seatCapacity !== undefined) {
    const seats = Math.floor(input.seatCapacity);
    if (!Number.isFinite(seats) || seats < 1) return { ok: false, error: "Seats must be at least 1." };
    patch.seat_capacity = seats;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to update." };
  const supabase = createClient();
  const { error } = await supabase.from("offshore_manifests").update(patch).eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function togglePaxNoShow(id: string, noShow: boolean): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase
    .from("offshore_manifest_pax")
    .update({ no_show: noShow })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function removeManifestPax(id: string): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("offshore_manifest_pax").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/**
 * Confirm the movement: outbound puts each (non-no-show) staff passenger on
 * board (POB up, fixed room assigned); inbound demobilises them (POB down).
 * Seat capacity is enforced. Manifest must be locked first.
 */
export async function confirmManifestMovement(id: string): Promise<ActionResult> {
  const gate = await requireOffshore("approve");
  if (gate) return gate;
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { data: m } = await supabase
    .from("offshore_manifests")
    .select("id, direction, installation_id, crew_id, scheduled_date, seat_capacity, status")
    .eq("id", id)
    .maybeSingle();
  if (!m) return { ok: false, error: "Manifest not found." };
  if (m.status === "completed") return { ok: false, error: "Manifest already approved." };
  if (m.status === "cancelled") return { ok: false, error: "Manifest is cancelled." };

  const { data: pax } = await supabase
    .from("offshore_manifest_pax")
    .select("id, profile_id, visit_request_id, no_show")
    .eq("manifest_id", id);
  const travelling = (pax ?? []).filter((p) => !p.no_show && p.profile_id);
  const visitors = (pax ?? []).filter((p) => !p.no_show && p.visit_request_id);
  if (travelling.length + visitors.length > (m.seat_capacity as number)) {
    return {
      ok: false,
      error: `Over seat capacity (${travelling.length + visitors.length}/${m.seat_capacity}).`,
    };
  }

  // Visitors: inbound (joining) -> on board; outbound (leaving) -> returned.
  if (visitors.length) {
    const vStatus = m.direction === "out" ? "onboard" : "returned";
    await supabase
      .from("offshore_visit_requests")
      .update({ status: vStatus })
      .in("id", visitors.map((p) => p.visit_request_id as string));
  }

  if (m.direction === "out") {
    // Fixed-room + crew lookup for each member.
    const ids = travelling.map((p) => p.profile_id as string);
    const idList = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
    const { data: staff } = await supabase
      .from("offshore_staff")
      .select("profile_id, fixed_room_id, fixed_bed, crew_id")
      .in("profile_id", idList);
    const roomByProfile = new Map<string, { room: string | null; bed: string | null; crew: string | null }>();
    for (const s of staff ?? [])
      roomByProfile.set(s.profile_id as string, {
        room: (s.fixed_room_id as string) ?? null,
        bed: (s.fixed_bed as string) ?? null,
        crew: (s.crew_id as string) ?? null,
      });

    // Idempotency: never board someone who already has an active onboard trip.
    const { data: existing } = await supabase
      .from("offshore_trips")
      .select("profile_id")
      .eq("status", "onboard")
      .in("profile_id", idList);
    const alreadyOnboard = new Set((existing ?? []).map((e) => e.profile_id as string));

    const nowIso = new Date().toISOString();
    for (const p of travelling) {
      const pid = p.profile_id as string;
      if (alreadyOnboard.has(pid)) continue; // skip duplicates
      const fixed = roomByProfile.get(pid);
      await supabase.from("offshore_trips").insert({
        tenant_id: tenant,
        profile_id: pid,
        installation_id: m.installation_id,
        // Prefer the manifest's crew; fall back to the person's roster crew so
        // POB "by crew" and crew-change suggestions stay accurate.
        crew_id: (m.crew_id as string | null) ?? fixed?.crew ?? null,
        category: "staff",
        trip_type: "crew_change_out",
        mobilize_date: m.scheduled_date,
        status: "onboard",
        hse_cleared_at: nowIso, // manifest approval is the HSE gate
        room_id: fixed?.room ?? null,
        bed_no: fixed?.bed ?? null,
      });
    }
  } else {
    // Inbound: demobilise the active onboard trip for each passenger.
    for (const p of travelling) {
      await supabase
        .from("offshore_trips")
        .update({ status: "demobilised", demob_date: m.scheduled_date })
        .eq("profile_id", p.profile_id)
        .eq("status", "onboard");
    }
  }

  await supabase
    .from("offshore_manifest_pax")
    .update({ boarded: true })
    .eq("manifest_id", id)
    .eq("no_show", false);
  await supabase.from("offshore_manifests").update({ status: "completed" }).eq("id", id);
  rev();
  return { ok: true };
}

/**
 * Amend one passenger after approval when the journey didn't complete:
 * inbound (joining) → they didn't arrive, take them off POB; outbound
 * (leaving) → they stayed aboard, put them back on POB.
 */
export async function reverseManifestPax(input: { paxId: string }): Promise<ActionResult> {
  const gate = await requireOffshore("approve");
  if (gate) return gate;
  const supabase = createClient();
  const { data: p } = await supabase
    .from("offshore_manifest_pax")
    .select("id, profile_id, visit_request_id, manifest:offshore_manifests(direction)")
    .eq("id", input.paxId)
    .maybeSingle();
  if (!p) return { ok: false, error: "Passenger not found." };
  const direction =
    (Array.isArray(p.manifest) ? p.manifest[0] : p.manifest)?.direction ?? "out";

  if (p.visit_request_id) {
    // Visitor: inbound didn't arrive -> back to approved; outbound stayed -> onboard.
    const vStatus = direction === "out" ? "approved" : "onboard";
    const { error } = await supabase
      .from("offshore_visit_requests")
      .update({ status: vStatus })
      .eq("id", p.visit_request_id);
    if (error) return { ok: false, error: error.message };
  } else if (p.profile_id) {
    if (direction === "out") {
      // Inbound joining — never arrived: cancel their on-board trip.
      const { error } = await supabase
        .from("offshore_trips")
        .update({ status: "cancelled" })
        .eq("profile_id", p.profile_id)
        .eq("status", "onboard");
      if (error) return { ok: false, error: error.message };
    } else {
      // Outbound leaving — stayed aboard: re-board them.
      const res = await boardMember(p.profile_id as string);
      if (!res.ok) return res;
    }
  }

  await supabase
    .from("offshore_manifest_pax")
    .update({ no_show: true, boarded: false })
    .eq("id", input.paxId);
  rev();
  return { ok: true };
}
