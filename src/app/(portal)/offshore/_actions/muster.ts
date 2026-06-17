"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";
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
    .select("profile_id, person:profiles!offshore_trips_profile_id_fkey(full_name), room:offshore_rooms(lifeboat)")
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
      lifeboat: r?.lifeboat ?? null,
    };
  });

  // On-board visitors (tracked via visit requests + bed allocations) muster too.
  const { data: visits } = await supabase
    .from("offshore_visit_requests")
    .select("id, visitor_name, offshore_bed_allocations(status, room:offshore_rooms(lifeboat))")
    .eq("status", "onboard")
    .eq("tenant_id", tenant);
  for (const v of (visits ?? []) as Record<string, any>[]) {
    const alloc = (v.offshore_bed_allocations as any[])?.find((a) => a.status !== "checked_out");
    const room = alloc && (Array.isArray(alloc.room) ? alloc.room[0] : alloc.room);
    rows.push({
      tenant_id: tenant,
      drill_id: drill.id,
      profile_id: null,
      name: `${v.visitor_name} (visitor)`,
      lifeboat: (room?.lifeboat as string | null) ?? null,
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
      accounted_at: accounted ? new Date().toISOString() : null,
      accounted_by: accounted ? user?.id ?? null : null,
    })
    .eq("id", checkinId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Close the roll-call. */
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
