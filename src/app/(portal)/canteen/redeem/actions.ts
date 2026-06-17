"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

async function requireStaff(): Promise<ActionResult | null> {
  if (!(await getAccess()).isCanteenStaff) {
    return { ok: false, error: "Only canteen staff can record meals." };
  }
  return null;
}

/** Record that an entitled employee took a meal on the given date. */
export async function redeemMeal(
  profileId: string,
  serviceDate: string,
): Promise<ActionResult> {
  const denied = await requireStaff();
  if (denied) return denied;

  const supabase = createClient();
  const { error } = await supabase.rpc("canteen_redeem_meal", {
    p_profile_id: profileId,
    p_date: serviceDate,
  });
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath("/canteen/redeem");
  return { ok: true };
}

/** Undo the most recent meal recorded for an employee on a date (correction). */
export async function undoMeal(
  profileId: string,
  serviceDate: string,
): Promise<ActionResult> {
  const denied = await requireStaff();
  if (denied) return denied;

  const supabase = createClient();
  const { data: last } = await supabase
    .from("canteen_meal_redemptions")
    .select("id")
    .eq("profile_id", profileId)
    .eq("redeemed_on", serviceDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!last) return { ok: false, error: "No meal to undo for this employee today." };

  const { error } = await supabase.rpc("canteen_unredeem_meal", {
    p_redemption_id: last.id,
  });
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath("/canteen/redeem");
  return { ok: true };
}
