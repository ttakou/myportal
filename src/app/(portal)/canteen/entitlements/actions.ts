"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function clampMeals(n: number, max: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(max, Math.round(n)));
}

async function requireHr(): Promise<ActionResult | null> {
  if (!(await getAccess()).isHr) {
    return { ok: false, error: "Only HR can manage meal entitlements." };
  }
  return null;
}

/** Add an employee to the entitlement roster (default one meal/working day). */
export async function grantEntitlement(
  profileId: string,
  dailyMeals = 1,
): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  if (!profileId) return { ok: false, error: "Choose an employee." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("canteen_meal_entitlements").insert({
    profile_id: profileId,
    daily_meals: clampMeals(dailyMeals, 10),
    granted_by: user?.id ?? null,
  });
  if (error) {
    const msg = error.code === "23505"
      ? "That employee already has a meal entitlement."
      : error.message;
    return { ok: false, error: msg };
  }

  revalidatePath("/canteen/entitlements");
  return { ok: true };
}

/** Change the base meals/working day for an entitlement. */
export async function updateEntitlementMeals(
  id: string,
  dailyMeals: number,
): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;

  const supabase = createClient();
  const { error } = await supabase
    .from("canteen_meal_entitlements")
    .update({ daily_meals: clampMeals(dailyMeals, 10) })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/canteen/entitlements");
  return { ok: true };
}

/** Pause or resume an entitlement without deleting it. */
export async function setEntitlementActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;

  const supabase = createClient();
  const { error } = await supabase
    .from("canteen_meal_entitlements")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/canteen/entitlements");
  return { ok: true };
}

/** Remove an employee from the roster entirely. */
export async function removeEntitlement(id: string): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;

  const supabase = createClient();
  const { error } = await supabase
    .from("canteen_meal_entitlements")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/canteen/entitlements");
  return { ok: true };
}

/** Grant a date-ranged visitor top-up to a host employee. */
export async function addVisitorExtra(input: {
  profileId: string;
  extraMeals: number;
  startsOn: string;
  endsOn: string;
  reason?: string;
}): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;

  const { profileId, startsOn, endsOn } = input;
  if (!profileId) return { ok: false, error: "Choose the host employee." };
  if (!startsOn || !endsOn) return { ok: false, error: "Set the start and end dates." };
  if (endsOn < startsOn) return { ok: false, error: "End date must be on or after the start date." };
  const extra = clampMeals(input.extraMeals, 50);
  if (extra < 1) return { ok: false, error: "Add at least one extra meal." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("canteen_meal_entitlement_extras").insert({
    profile_id: profileId,
    extra_meals: extra,
    starts_on: startsOn,
    ends_on: endsOn,
    reason: input.reason?.trim() || null,
    created_by: user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/canteen/entitlements");
  return { ok: true };
}

/** Cancel a visitor top-up. */
export async function removeVisitorExtra(id: string): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;

  const supabase = createClient();
  const { error } = await supabase
    .from("canteen_meal_entitlement_extras")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/canteen/entitlements");
  return { ok: true };
}
