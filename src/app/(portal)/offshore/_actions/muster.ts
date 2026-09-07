"use server";

import { createClient } from "@/lib/supabase/server";
import { tripLifeboat, visitorLifeboat } from "@/lib/offshore";
import type { ActionResult } from "@/types/actions";
import type { MusterOutcome } from "@/lib/offshore/muster-closeout";
import { requireOffshore, rev, tenantId } from "./_shared";

/** Start a roll-call: snapshot everyone on board into check-ins (unaccounted). */
export async function startMusterDrill(kind: "drill" | "real" = "drill"): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // End any drill already open so there's a single live roll-call.
  await supabase
    .from("offshore_muster_drills")
    .update({ ended_at: new Date().toISOString() })
    .is("ended_at", null)
    .eq("tenant_id", tenant);

  const { data: drill, error } = await supabase
    .from("offshore_muster_drills")
    .insert({ tenant_id: tenant, started_by: user?.id ?? null, kind })
    .select("id")
    .maybeSingle();
  if (error || !drill) return { ok: false, error: error?.message ?? "Could not start the roll-call." };

  const { data: onboard } = await supabase
    .from("offshore_trips")
    .select("profile_id, lifeboat, lifeboat_override, person:profiles!offshore_trips_profile_id_fkey(full_name), room:offshore_rooms(lifeboat)")
    .eq("status", "onboard")
    .eq("tenant_id", tenant);
  const rows = ((onboard ?? []) as Record<string, any>[]).map((t) => {
    const p = Array.isArray(t.person) ? t.person[0] : t.person;
    const r = Array.isArray(t.room) ? t.room[0] : t.room;
    return {
      tenant_id: tenant,
      drill_id: drill.id,
      profile_id: t.profile_id,
      name: p?.full_name ?? "Crew",
      lifeboat: tripLifeboat({ lifeboat_override: t.lifeboat_override, room_lifeboat: r?.lifeboat, lifeboat: t.lifeboat }),
    };
  });

  // On-board visitors (tracked via visit requests + bed allocations) muster too.
  const { data: visits } = await supabase
    .from("offshore_visit_requests")
    .select("id, visitor_name, is_casual, lifeboat, offshore_bed_allocations(status, room:offshore_rooms(lifeboat))")
    .eq("status", "onboard")
    .eq("tenant_id", tenant);
  for (const v of (visits ?? []) as Record<string, any>[]) {
    const alloc = (v.offshore_bed_allocations as any[])?.find((a) => a.status !== "checked_out");
    const room = alloc && (Array.isArray(alloc.room) ? alloc.room[0] : alloc.room);
    rows.push({
      tenant_id: tenant,
      drill_id: drill.id,
      profile_id: null,
      name: `${v.visitor_name} (${v.is_casual ? "casual" : "visitor"})`,
      lifeboat: visitorLifeboat({ lifeboat: v.lifeboat as string | null, room_lifeboat: (room?.lifeboat as string | null) ?? null }),
    });
  }

  if (rows.length) await supabase.from("offshore_muster_checkins").insert(rows);
  rev();
  return { ok: true };
}

/** Tick a person accounted/unaccounted at their muster station. */
export async function setMusterCheckin(checkinId: string, accounted: boolean): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("offshore_muster_checkins")
    .update({
      accounted,
      outcome: accounted ? "accounted" : null,
      accounted_at: accounted ? new Date().toISOString() : null,
      accounted_by: accounted ? user?.id ?? null : null,
    })
    .eq("id", checkinId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/**
 * Record what became of one person: accounted, a no-show, or never on board
 * (the POB snapshot had them, the platform did not). Null reopens the row.
 */
export async function setMusterOutcome(
  checkinId: string,
  outcome: MusterOutcome | null,
): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const accounted = outcome === "accounted";
  const { error } = await supabase
    .from("offshore_muster_checkins")
    .update({
      accounted,
      outcome,
      accounted_at: accounted ? new Date().toISOString() : null,
      accounted_by: accounted ? user?.id ?? null : null,
    })
    .eq("id", checkinId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/**
 * Close out a roll-call: everyone still without an outcome gets `remaining`,
 * the drill ends if it has not, and the report becomes final. Works on an
 * open drill and on one that was ended but never closed out.
 */
export async function closeOutMusterDrill(
  drillId: string,
  input: { remaining: Exclude<MusterOutcome, "accounted">; note?: string },
): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  if (input.remaining !== "no_show" && input.remaining !== "not_on_board") {
    return { ok: false, error: "Say what the people still open are: no-show or not on board." };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: drill } = await supabase
    .from("offshore_muster_drills")
    .select("id, ended_at, closed_out_at, voided")
    .eq("id", drillId)
    .maybeSingle();
  if (!drill) return { ok: false, error: "Roll-call not found." };
  if (drill.voided) return { ok: false, error: "This roll-call was voided." };
  if (drill.closed_out_at) return { ok: false, error: "This roll-call is already closed out." };

  const { error: rowsErr } = await supabase
    .from("offshore_muster_checkins")
    .update({ outcome: input.remaining, accounted: false, accounted_at: null, accounted_by: null })
    .eq("drill_id", drillId)
    .is("outcome", null);
  if (rowsErr) return { ok: false, error: rowsErr.message };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("offshore_muster_drills")
    .update({
      ended_at: (drill.ended_at as string | null) ?? now,
      closed_out_at: now,
      closed_out_by: user?.id ?? null,
      close_note: input.note?.trim() || null,
    })
    .eq("id", drillId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** A test run or an abandoned roll-call: kept for the record, counted nowhere. */
export async function voidMusterDrill(drillId: string, note?: string): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const { data: drill } = await supabase
    .from("offshore_muster_drills")
    .select("id, ended_at")
    .eq("id", drillId)
    .maybeSingle();
  if (!drill) return { ok: false, error: "Roll-call not found." };
  const { error } = await supabase
    .from("offshore_muster_drills")
    .update({
      voided: true,
      ended_at: (drill.ended_at as string | null) ?? now,
      closed_out_at: now,
      closed_out_by: user?.id ?? null,
      close_note: note?.trim() || null,
    })
    .eq("id", drillId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Stop the clock without closing out; the close-out can follow. */
export async function endMusterDrill(drillId: string): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase
    .from("offshore_muster_drills")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", drillId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
