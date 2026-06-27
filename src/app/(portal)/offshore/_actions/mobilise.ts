"use server";

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyUsers } from "@/lib/notify";
import type { ActionResult } from "@/types/actions";
import type { CrewChangePrefill, CrewChangePrefillMember } from "@/types/offshore";
import { requireOffshore, rev, tenantId } from "./_shared";

const DAY = 86_400_000;

/** Map profile ids → display name (full name, else email). */
async function namesFor(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
  return new Map((data ?? []).map((p: Record<string, any>) => [p.id, p.full_name || p.email || "—"]));
}

/** Map room ids → human label ("Block Room"). */
async function roomLabels(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("offshore_rooms").select("id, room_number, block").in("id", ids);
  return new Map(
    (data ?? []).map((r: Record<string, any>) => [
      r.id,
      [r.block, r.room_number].filter(Boolean).join(" ") || "—",
    ]),
  );
}

/** The crew's current offshore window from its rotation cycle. */
function scheduleWindow(crew: {
  offshore_days: number;
  onshore_days: number;
  cycle_start_date: string | null;
}): { fromIso: string; toIso: string } {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  let from = today;
  let to = today + crew.offshore_days * DAY;
  if (crew.cycle_start_date) {
    const period = crew.offshore_days + crew.onshore_days;
    const start = new Date(crew.cycle_start_date + "T00:00:00Z").getTime();
    const idx = period > 0 ? (((Math.floor((today - start) / DAY) % period) + period) % period) : 0;
    if (idx < crew.offshore_days) {
      from = today - idx * DAY;
      to = from + crew.offshore_days * DAY;
    }
  }
  return {
    fromIso: new Date(from).toISOString().slice(0, 10),
    toIso: new Date(to).toISOString().slice(0, 10),
  };
}

/** Board a single member now (late arrival joining colleagues already offshore). */
export async function boardMember(profileId: string): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { data: already } = await supabase
    .from("offshore_trips")
    .select("id")
    .eq("profile_id", profileId)
    .eq("status", "onboard")
    .maybeSingle();
  if (already) return { ok: true }; // already aboard

  const { data: staff } = await supabase
    .from("offshore_staff")
    .select("crew_id, fixed_room_id, fixed_bed, lifeboat")
    .eq("profile_id", profileId)
    .maybeSingle();

  let installationId: string | null = null;
  let fromIso = new Date().toISOString().slice(0, 10);
  let toIso: string | null = null;
  if (staff?.crew_id) {
    const { data: crew } = await supabase
      .from("offshore_crews")
      .select("offshore_days, onshore_days, cycle_start_date, installation_id")
      .eq("id", staff.crew_id)
      .maybeSingle();
    if (crew) {
      installationId = (crew.installation_id as string | null) ?? null;
      const DAY = 86_400_000;
      const today = new Date(fromIso + "T00:00:00Z").getTime();
      let from = today;
      let to = today + (crew.offshore_days as number) * DAY;
      if (crew.cycle_start_date) {
        const period = (crew.offshore_days as number) + (crew.onshore_days as number);
        const start = new Date((crew.cycle_start_date as string) + "T00:00:00Z").getTime();
        const idx = ((Math.floor((today - start) / DAY) % period) + period) % period;
        if (idx < (crew.offshore_days as number)) {
          from = today - idx * DAY;
          to = from + (crew.offshore_days as number) * DAY;
        }
      }
      fromIso = new Date(from).toISOString().slice(0, 10);
      toIso = new Date(to).toISOString().slice(0, 10);
    }
  }

  const { error } = await supabase.from("offshore_trips").insert({
    tenant_id: tenant,
    profile_id: profileId,
    installation_id: installationId,
    crew_id: staff?.crew_id ?? null,
    category: "staff",
    trip_type: "crew_change_out",
    mobilize_date: fromIso,
    demob_date: toIso,
    status: "onboard",
    hse_cleared_at: new Date().toISOString(),
    room_id: staff?.fixed_room_id ?? null,
    bed_no: staff?.fixed_bed ?? null,
    lifeboat: staff?.lifeboat ?? null,
    mode: "auto",
  });
  if (error) return { ok: false, error: error.message };
  await notifyUsers({
    tenantId: tenant,
    profileIds: [profileId],
    category: "general",
    title: "Boarded offshore",
    body: "You are now recorded on board (POB).",
    url: "/offshore",
  });
  rev();
  return { ok: true };
}

/** Board a crew for its current offshore window (idempotent). */
export async function mobiliseCrew(crewId: string): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { data: crew } = await supabase
    .from("offshore_crews")
    .select("offshore_days, onshore_days, cycle_start_date, installation_id")
    .eq("id", crewId)
    .maybeSingle();
  if (!crew) return { ok: false, error: "Crew not found." };

  const DAY = 86_400_000;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  let from = today;
  let to = today + (crew.offshore_days as number) * DAY;
  if (crew.cycle_start_date) {
    const period = (crew.offshore_days as number) + (crew.onshore_days as number);
    const start = new Date((crew.cycle_start_date as string) + "T00:00:00Z").getTime();
    const idx = ((Math.floor((today - start) / DAY) % period) + period) % period;
    if (idx < (crew.offshore_days as number)) {
      from = today - idx * DAY;
      to = from + (crew.offshore_days as number) * DAY;
    }
  }
  const fromIso = new Date(from).toISOString().slice(0, 10);
  const toIso = new Date(to).toISOString().slice(0, 10);

  const { data: members } = await supabase
    .from("offshore_staff")
    .select("profile_id, fixed_room_id, fixed_bed")
    .eq("crew_id", crewId);
  const ids = (members ?? []).map((m) => m.profile_id as string);
  if (ids.length === 0) return { ok: false, error: "This crew has no members." };

  const { data: already } = await supabase
    .from("offshore_trips")
    .select("profile_id")
    .eq("status", "onboard")
    .in("profile_id", ids);
  const aboard = new Set((already ?? []).map((a) => a.profile_id as string));

  const nowIso = new Date().toISOString();
  const rows = (members ?? [])
    .filter((m) => !aboard.has(m.profile_id as string))
    .map((m) => ({
      tenant_id: tenant,
      profile_id: m.profile_id,
      installation_id: crew.installation_id,
      crew_id: crewId,
      category: "staff",
      trip_type: "crew_change_out",
      mobilize_date: fromIso,
      demob_date: toIso,
      status: "onboard",
      hse_cleared_at: nowIso, // schedule-driven boarding is the clearance gate
      room_id: m.fixed_room_id,
      bed_no: m.fixed_bed,
      mode: "auto",
    }));
  if (rows.length === 0) return { ok: true }; // already all aboard
  const { error } = await supabase.from("offshore_trips").insert(rows);
  if (error) return { ok: false, error: error.message };
  await notifyUsers({
    tenantId: tenant,
    profileIds: rows.map((r) => r.profile_id as string),
    category: "general",
    title: "Crew mobilised",
    body: "Your crew has been mobilised — you are now on board.",
    url: "/offshore",
  });
  rev();
  return { ok: true };
}

/**
 * Pre-fill for a MANUAL crew change: the schedule-derived dates plus the crew's
 * people (with their fixed cabins), ready for the operator to edit before
 * boarding/offboarding. For mobilise the roster is offered; for demobilise the
 * people currently on board are offered.
 */
export async function getCrewChangePrefill(
  crewId: string,
  action: "mobilise" | "demobilise",
): Promise<{ ok: true; data: CrewChangePrefill } | { ok: false; error: string }> {
  const gate = await requireOffshore("operate");
  if (gate) return { ok: false, error: gate.error ?? "Not authorized." };
  const supabase = createClient();

  const { data: crew } = await supabase
    .from("offshore_crews")
    .select("offshore_days, onshore_days, cycle_start_date")
    .eq("id", crewId)
    .maybeSingle();
  if (!crew) return { ok: false, error: "Crew not found." };

  const { fromIso, toIso } = scheduleWindow({
    offshore_days: crew.offshore_days as number,
    onshore_days: crew.onshore_days as number,
    cycle_start_date: crew.cycle_start_date as string | null,
  });

  // Who's aboard right now for this crew (carry their actual room/bed).
  const { data: aboardTrips } = await supabase
    .from("offshore_trips")
    .select("profile_id, room_id, bed_no")
    .eq("crew_id", crewId)
    .eq("status", "onboard");
  const aboard = new Map<string, { room_id: string | null; bed_no: string | null }>();
  for (const t of aboardTrips ?? [])
    aboard.set(t.profile_id as string, {
      room_id: (t.room_id as string | null) ?? null,
      bed_no: (t.bed_no as string | null) ?? null,
    });

  let members: CrewChangePrefillMember[] = [];
  if (action === "mobilise") {
    const { data: staff } = await supabase
      .from("offshore_staff")
      .select("profile_id, fixed_room_id, fixed_bed")
      .eq("crew_id", crewId);
    const rows = staff ?? [];
    const names = await namesFor(supabase, rows.map((r) => r.profile_id as string));
    const rooms = await roomLabels(
      supabase,
      rows.map((r) => r.fixed_room_id as string | null).filter(Boolean) as string[],
    );
    members = rows.map((r) => {
      const roomId = (r.fixed_room_id as string | null) ?? null;
      return {
        profileId: r.profile_id as string,
        name: names.get(r.profile_id as string) ?? "—",
        roomId,
        roomLabel: roomId ? rooms.get(roomId) ?? null : null,
        bed: (r.fixed_bed as string | null) ?? null,
        aboard: aboard.has(r.profile_id as string),
      };
    });
  } else {
    const ids = [...aboard.keys()];
    const names = await namesFor(supabase, ids);
    const rooms = await roomLabels(
      supabase,
      [...aboard.values()].map((v) => v.room_id).filter(Boolean) as string[],
    );
    members = ids.map((id) => {
      const a = aboard.get(id)!;
      return {
        profileId: id,
        name: names.get(id) ?? "—",
        roomId: a.room_id,
        roomLabel: a.room_id ? rooms.get(a.room_id) ?? null : null,
        bed: a.bed_no,
        aboard: true,
      };
    });
  }
  members.sort((a, b) => a.name.localeCompare(b.name));

  return {
    ok: true,
    data: {
      crewId,
      action,
      mobilizeDate: fromIso,
      demobDate: action === "mobilise" ? toIso : new Date().toISOString().slice(0, 10),
      members,
    },
  };
}

/** Board a hand-picked subset of a crew, with operator-chosen dates (manual). */
export async function mobiliseCrewManual(input: {
  crewId: string;
  mobilizeDate: string;
  demobDate?: string | null;
  members: { profileId: string; roomId?: string | null; bed?: string | null }[];
}): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  if (!input.mobilizeDate) return { ok: false, error: "Pick a mobilise date." };
  const chosen = input.members.filter((m) => m.profileId);
  if (chosen.length === 0) return { ok: false, error: "Select at least one person." };

  const { data: crew } = await supabase
    .from("offshore_crews")
    .select("installation_id")
    .eq("id", input.crewId)
    .maybeSingle();
  if (!crew) return { ok: false, error: "Crew not found." };

  // Never double-board anyone already on board.
  const ids = chosen.map((m) => m.profileId);
  const { data: already } = await supabase
    .from("offshore_trips")
    .select("profile_id")
    .eq("status", "onboard")
    .in("profile_id", ids);
  const aboard = new Set((already ?? []).map((a) => a.profile_id as string));

  const nowIso = new Date().toISOString();
  const rows = chosen
    .filter((m) => !aboard.has(m.profileId))
    .map((m) => ({
      tenant_id: tenant,
      profile_id: m.profileId,
      installation_id: crew.installation_id,
      crew_id: input.crewId,
      category: "staff",
      trip_type: "crew_change_out",
      mobilize_date: input.mobilizeDate,
      demob_date: input.demobDate || null,
      status: "onboard",
      hse_cleared_at: nowIso,
      room_id: m.roomId ?? null,
      bed_no: m.bed ?? null,
      mode: "manual",
    }));
  if (rows.length === 0) return { ok: true }; // all already aboard
  const { error } = await supabase.from("offshore_trips").insert(rows);
  if (error) return { ok: false, error: error.message };
  await notifyUsers({
    tenantId: tenant,
    profileIds: rows.map((r) => r.profile_id as string),
    category: "general",
    title: "Crew mobilised",
    body: "You have been mobilised — you are now on board.",
    url: "/offshore",
  });
  rev();
  return { ok: true };
}

/** Offboard a hand-picked subset of a crew on a chosen date (manual). */
export async function demobiliseSelected(input: {
  crewId: string;
  demobDate?: string | null;
  profileIds: string[];
}): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const ids = input.profileIds.filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "Select at least one person." };
  const day = input.demobDate || new Date().toISOString().slice(0, 10);

  const { data: affected } = await supabase
    .from("offshore_trips")
    .select("profile_id")
    .eq("crew_id", input.crewId)
    .eq("status", "onboard")
    .in("profile_id", ids);

  const { error } = await supabase
    .from("offshore_trips")
    .update({ status: "demobilised", demob_date: day })
    .eq("crew_id", input.crewId)
    .eq("status", "onboard")
    .in("profile_id", ids);
  if (error) return { ok: false, error: error.message };
  const tenant = await tenantId();
  if (tenant) {
    await notifyUsers({
      tenantId: tenant,
      profileIds: (affected ?? []).map((a) => a.profile_id as string),
      category: "general",
      title: "Crew demobilised",
      body: "You have been demobilised — you are no longer on board.",
      url: "/offshore",
    });
  }
  rev();
  return { ok: true };
}

/** Offboard everyone currently on board for a crew. */
export async function demobiliseCrew(crewId: string): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Capture who is being demobilised before the update clears the onboard flag.
  const { data: affected } = await supabase
    .from("offshore_trips")
    .select("profile_id")
    .eq("crew_id", crewId)
    .eq("status", "onboard");

  const { error } = await supabase
    .from("offshore_trips")
    .update({ status: "demobilised", demob_date: today })
    .eq("crew_id", crewId)
    .eq("status", "onboard");
  if (error) return { ok: false, error: error.message };
  const tenant = await tenantId();
  if (tenant) {
    await notifyUsers({
      tenantId: tenant,
      profileIds: (affected ?? []).map((a) => a.profile_id as string),
      category: "general",
      title: "Crew demobilised",
      body: "Your crew has been demobilised — you are no longer on board.",
      url: "/offshore",
    });
  }
  rev();
  return { ok: true };
}
