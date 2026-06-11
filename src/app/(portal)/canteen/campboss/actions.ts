"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Campboss marks a reservation as packed (or un-packs it). */
export async function setReservationPrepared(
  bookingId: string,
  prepared: boolean,
): Promise<ActionResult> {
  if (!(await getAccess()).isCanteenStaff) {
    return { ok: false, error: "Not authorized." };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("canteen_bookings")
    .update({ prepared_at: prepared ? new Date().toISOString() : null })
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/canteen/campboss");
  revalidatePath("/canteen/serving");
  return { ok: true };
}

/** Campboss marks a reservation as collected (picked up). */
export async function setReservationCollected(
  bookingId: string,
  collected: boolean,
): Promise<ActionResult> {
  if (!(await getAccess()).isCanteenStaff) {
    return { ok: false, error: "Not authorized." };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("canteen_bookings")
    .update({
      collected_at: collected ? new Date().toISOString() : null,
      status: collected ? "served" : "booked",
    })
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/canteen/campboss");
  return { ok: true };
}
