"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";
import { canManageOffshore, rev, tenantId } from "./_shared";

/** Board a single member now (late arrival joining colleagues already offshore). */
export async function boardMember(profileId: string): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
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
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Board a crew for its current offshore window (idempotent). */
export async function mobiliseCrew(crewId: string): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
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
    }));
  if (rows.length === 0) return { ok: true }; // already all aboard
  const { error } = await supabase.from("offshore_trips").insert(rows);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Offboard everyone currently on board for a crew. */
export async function demobiliseCrew(crewId: string): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("offshore_trips")
    .update({ status: "demobilised", demob_date: today })
    .eq("crew_id", crewId)
    .eq("status", "onboard");
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
