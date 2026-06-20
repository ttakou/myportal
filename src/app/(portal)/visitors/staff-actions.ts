"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth";
import { requireModule } from "@/lib/permissions-server";
import { today } from "@/lib/canteen";
import { distanceMeters, formatDistance, getBaseGeofence } from "@/lib/geo";
import type { ActionResult } from "@/types/actions";

function revalidate() {
  revalidatePath("/visitors");
  revalidatePath("/dashboard");
}

/** Insert/refresh today's check-in for a staff member (clears any check-out). */
async function recordCheckIn(
  profileId: string,
  method: "self" | "guard",
  coords: { lat: number; lng: number } | null,
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

export async function staffCheckIn(profileId: string): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  return recordCheckIn(profileId, "guard", null);
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
  if (!fence) {
    return {
      ok: false,
      error: "Site location isn't configured yet — ask an administrator to set the base coordinates.",
    };
  }
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
