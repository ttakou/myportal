"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
/** Trim a free-text comment to a sane length, or null when empty. */
function cleanComment(c?: string | null): string | null {
  const t = (c ?? "").trim();
  return t ? t.slice(0, 500) : null;
}

/**
 * Resolve an optional operator-supplied arrival time (ISO) to a timestamp.
 * Empty → now. Rejects unparseable values and times more than 5 min ahead.
 */
function parseArrivalTime(iso?: string | null): { iso: string; error?: string } {
  if (!iso || !iso.trim()) return { iso: new Date().toISOString() };
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { iso: "", error: "Invalid arrival time." };
  if (t > Date.now() + 5 * 60000) return { iso: "", error: "Arrival time can't be in the future." };
  return { iso: new Date(t).toISOString() };
}

async function recordCheckIn(
  profileId: string,
  method: "self" | "guard",
  coords: { lat: number; lng: number } | null,
  vehicle?: { type?: string | null; plate?: string | null },
  comment?: string | null,
  checkInAt?: string | null,
): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  // Arrival defaults to now; a guard may enter/adjust it (arrived earlier than logged).
  const arrival = parseArrivalTime(checkInAt);
  if (arrival.error) return { ok: false, error: arrival.error };

  const { error } = await supabase.from("staff_attendance").upsert(
    {
      tenant_id: tenant.id,
      profile_id: profileId,
      attendance_date: today(),
      check_in_at: arrival.iso,
      check_out_at: null,
      check_in_method: method,
      checked_in_by: user?.id ?? null,
      check_in_lat: coords?.lat ?? null,
      check_in_lng: coords?.lng ?? null,
      vehicle_type: vehicle?.type?.trim() || null,
      vehicle_plate: vehicle?.plate?.trim() || null,
      check_in_comment: cleanComment(comment),
      check_out_comment: null,
    },
    { onConflict: "profile_id,attendance_date" },
  );
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Stamp today's check-out for a staff member, with an optional comment. */
async function recordCheckOut(profileId: string, comment?: string | null): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  const patch: Record<string, unknown> = {
    check_out_at: new Date().toISOString(),
    checked_out_by: user?.id ?? null,
  };
  const c = cleanComment(comment);
  if (c) patch.check_out_comment = c;
  const { error } = await supabase
    .from("staff_attendance")
    .update(patch)
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
  comment?: string | null,
  checkInAt?: string | null,
): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  return recordCheckIn(profileId, "guard", null, vehicle, comment, checkInAt);
}

/**
 * Correct a staff member's recorded arrival time for today — e.g. they arrived
 * earlier than the gate logged them. Kept before any recorded check-out.
 */
export async function setStaffCheckInAt(profileId: string, checkInAt: string): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  if (!checkInAt?.trim()) return { ok: false, error: "Pick an arrival time." };
  const arrival = parseArrivalTime(checkInAt);
  if (arrival.error) return { ok: false, error: arrival.error };
  const supabase = createClient();
  const { data: row } = await supabase
    .from("staff_attendance")
    .select("check_in_at, check_out_at")
    .eq("profile_id", profileId)
    .eq("attendance_date", today())
    .maybeSingle();
  if (!row) return { ok: false, error: "No check-in recorded today for this person." };
  if (row.check_out_at && arrival.iso > (row.check_out_at as string)) {
    return { ok: false, error: "Arrival time must be before the check-out time." };
  }
  const { error } = await supabase
    .from("staff_attendance")
    .update({ check_in_at: arrival.iso })
    .eq("profile_id", profileId)
    .eq("attendance_date", today());
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/**
 * Correct a staff member's recorded departure time for today — e.g. they left
 * before the gate logged them out. Kept after the recorded arrival and not in
 * the future.
 */
export async function setStaffCheckOutAt(profileId: string, checkOutAt: string): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  if (!checkOutAt?.trim()) return { ok: false, error: "Pick a departure time." };
  const t = Date.parse(checkOutAt);
  if (Number.isNaN(t)) return { ok: false, error: "Invalid departure time." };
  if (t > Date.now() + 5 * 60000) return { ok: false, error: "Departure time can't be in the future." };
  const iso = new Date(t).toISOString();
  const supabase = createClient();
  const { data: row } = await supabase
    .from("staff_attendance")
    .select("check_in_at, check_out_at")
    .eq("profile_id", profileId)
    .eq("attendance_date", today())
    .maybeSingle();
  if (!row) return { ok: false, error: "No check-in recorded today for this person." };
  if (!row.check_out_at) return { ok: false, error: "This person has not checked out yet." };
  if (row.check_in_at && iso < (row.check_in_at as string)) {
    return { ok: false, error: "Departure time must be after the arrival time." };
  }
  const { error } = await supabase
    .from("staff_attendance")
    .update({ check_out_at: iso })
    .eq("profile_id", profileId)
    .eq("attendance_date", today());
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function staffCheckOut(
  profileId: string,
  comment?: string | null,
): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;
  return recordCheckOut(profileId, comment);
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

// ---- Reception: register a walk-in staff member / contractor ----------------

/**
 * Let reception register a staff member or contractor who isn't in the system
 * yet, so they can be checked in and mustered. Deliberately restricted: the new
 * profile is always a plain **employee** account with **no** functional roles,
 * access roles, manager or module access — reception cannot define anyone's
 * role or permissions in the app. An admin can elevate later if needed.
 */
export async function registerStaffAtGate(input: {
  fullName: string;
  employeeType?: "employee" | "contractor";
  department?: string;
  empNum?: string;
  email?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("visitors", "operate");
  if (gate) return gate;

  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: "Full name is required." };
  const realEmail = (input.email ?? "").trim().toLowerCase();
  if (realEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(realEmail)) {
    return { ok: false, error: "Enter a valid email, or leave it blank." };
  }
  const hasEmail = realEmail.length > 0;
  // Auth needs a unique login id even with no real email; use a placeholder and
  // keep profiles.email null. Reception-created accounts are for tracking — they
  // aren't expected to log in, so the random password is never surfaced.
  const email = hasEmail ? realEmail : `pending-${randomBytes(6).toString("hex")}@no-email.local`;
  const employeeType = input.employeeType === "contractor" ? "contractor" : "employee";

  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Server is missing the service-role key." };

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(24).toString("base64"),
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("already")
        ? "An account with that email already exists."
        : error.message,
    };
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: data.user.id,
      email: hasEmail ? email : null,
      full_name: fullName,
      tenant_id: tenant.id,
      // Forced: reception can never grant a role or any access here.
      role: "employee",
      manager_id: null,
      department: input.department?.trim() || null,
      employee_type: employeeType,
      emp_num: input.empNum?.trim() || null,
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (profileError) {
    return {
      ok: false,
      error:
        profileError.code === "23505" && profileError.message.includes("emp_num")
          ? "That employee number is already in use."
          : `Account created but profile setup failed: ${profileError.message}`,
    };
  }
  revalidate();
  return { ok: true };
}
