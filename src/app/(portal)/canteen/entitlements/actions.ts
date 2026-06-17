"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

function clampMeals(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(10, Math.round(n)));
}

async function requireHr(): Promise<ActionResult | null> {
  if (!(await getAccess()).isHr) {
    return { ok: false, error: "Only HR can manage meal entitlements." };
  }
  return null;
}

/**
 * Grant a defined-period entitlement to one or more employees. Creating several
 * at once covers a group (e.g. an offshore crew for a project's duration).
 */
export async function grantEntitlements(input: {
  profileIds: string[];
  dailyMeals: number;
  startsOn: string;
  endsOn: string;
  reason?: string;
}): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;

  const ids = [...new Set(input.profileIds.filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "Choose at least one employee." };
  if (!input.startsOn || !input.endsOn) {
    return { ok: false, error: "Set the start and end dates." };
  }
  if (input.endsOn < input.startsOn) {
    return { ok: false, error: "End date must be on or after the start date." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const meals = clampMeals(input.dailyMeals);
  const reason = input.reason?.trim() || null;
  const rows = ids.map((profile_id) => ({
    profile_id,
    daily_meals: meals,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    reason,
    granted_by: user?.id ?? null,
  }));

  const { error } = await supabase.from("canteen_meal_entitlements").insert(rows);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/canteen/entitlements");
  return { ok: true };
}

/** Remove an entitlement grant. */
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
