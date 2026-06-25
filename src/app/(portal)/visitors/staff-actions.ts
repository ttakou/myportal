"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth";
import { requireModule } from "@/lib/permissions-server";
import { today } from "@/lib/canteen";
import { distanceMeters, formatDistance, getBaseGeofence } from "@/lib/geo";
import { getMyAttendance } from "@/lib/staff-attendance";
import type { ActionResult } from "@/types/actions";

export type ReconcileStatus =
  | "checked_in" // was away + in range → auto checked in
  | "left_site" // on site but now out of range → flag "looks like you left"
  | "on_site" // on site and still in range → nothing
  | "away" // not checked in and out of range → nothing
  | "done" // already checked out today → nothing
  | "no_location"; // no coords / not signed in

/**
 * Periodic geofence reconcile for the signed-in user (called from the client
 * every ~30 min and on app open). Auto-checks-in when they're within the base
 * geofence and haven't checked in today; when they're on site but have drifted
 * out of range (with hysteresis) it only FLAGS "looks like you left" — it never
 * auto-checks-out. Never re-checks-in after they've checked out for the day.
 */
export async function autoReconcileAttendance(
  coords: { lat: number; lng: number } | null,
): Promise<{ ok: boolean; status: ReconcileStatus; distanceM?: number }> {
  const user = await getCachedUser();
  if (!user) return { ok: false, status: "no_location" };
  if (!coords) return { ok: true, status: "no_location" };

  const fence = getBaseGeofence();
  const dist = distanceMeters(coords, fence);
  const att = await getMyAttendance();

  if (att.status === "away") {
    if (dist <= fence.radiusM) {
      const res = await recordCheckIn(user.id, "self", coords);
      return res.ok
        ? { ok: true, status: "checked_in", distanceM: dist }
        : { ok: false, status: "away", distanceM: dist };
    }
    return { ok: true, status: "away", distanceM: dist };
  }

  if (att.status === "on_site") {
    // Hysteresis: only flag once clearly outside (1.2× radius) to avoid GPS jitter.
    if (dist > fence.radiusM * 1.2) return { ok: true, status: "left_site", distanceM: dist };
    return { ok: true, status: "on_site", distanceM: dist };
  }

  // status === "left" → done for the day; don't auto re-check-in.
  return { ok: true, status: "done", distanceM: dist };
}

function revalidate() {
  revalidatePath("/visitors");
  revalidatePath("/dashboard");
}

/** Insert/refresh today's check-in for a staff member (clears any check-out). */
async function recordCheckIn(
  profileId: string,
  method: "self" | "guard",
  coords: { lat: number; lng: number } | null,
  vehicle?: { type?: string | null; plate?: string | null },
): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { error } = await supabase.from("staff_attendance").upsert(
    {
      tenant_id: tenant.id,
      profile_id: profileId,
      attendance_date: today(),
      check_in_at: new Date().toISOString(),
      check_out_at: null,
      check_in_method: method,
      checked_in_by: user?.id ?? null,
      check_in_lat: coords?.lat ?? null,
      check_in_lng: coords?.lng ?? null,
      vehicle_type: vehicle?.type?.trim() || null,
      vehicle_plate: vehicle?.plate?.trim() || null,
    },
    { onConflict: "profile_id,attendance_date" },
  );
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Stamp today's check-out for a staff member. */
async function recordCheckOut(profileId: string): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  const { error } = await supabase
    .from("staff_attendance")
    .update({ check_out_at: new Date().toISOString(), checked_out_by: user?.id ?? null })
    .eq("profile_id", profileId)
    .eq("attendance_date", today());
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

// ---- Guard / reception (acts on any staff member) ---------------------------

export async function staffCheckIn(
  profileId: string,
  vehicle?: { type?: string | null; plate?: string | null },
): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  return recordCheckIn(profileId, "guard", null, vehicle);
}

export async function staffCheckOut(profileId: string): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  return recordCheckOut(profileId);
}

// ---- Self service ("I'm in", geofenced to the base) -------------------------

export async function selfCheckIn(
  coords: { lat: number; lng: number } | null,
): Promise<ActionResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const fence = getBaseGeofence();
  if (!coords) {
    return { ok: false, error: "Turn on location to check yourself in." };
  }
  const dist = distanceMeters(coords, fence);
  if (dist > fence.radiusM) {
    return {
      ok: false,
      error: `You're ${formatDistance(dist)} from the base — move within ${formatDistance(fence.radiusM)} of the site to check in.`,
    };
  }
  return recordCheckIn(user.id, "self", coords);
}

export async function selfCheckOut(): Promise<ActionResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "You're not signed in." };
  return recordCheckOut(user.id);
}
