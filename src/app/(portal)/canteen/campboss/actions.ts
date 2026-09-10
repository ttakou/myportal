"use server";

import { revalidatePath } from "next/cache";
import { notifyUsers } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/permissions-server";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

/** Campboss marks a reservation as packed (or un-packs it). */
export async function setReservationPrepared(
  bookingId: string,
  prepared: boolean,
): Promise<ActionResult> {
  const gate = await requireModule("canteen", "operate", (a) => a.isCanteenStaff);
  if (gate) return gate;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("canteen_bookings")
    .update({ prepared_at: prepared ? new Date().toISOString() : null })
    .eq("id", bookingId)
    .select("tenant_id, profile_id, meal_period, dish:canteen_dishes(name), kitchen:canteen_kitchens(name)")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  // The person hears their meal is ready to collect.
  if (prepared && data?.profile_id) {
    const dish = (Array.isArray(data.dish) ? data.dish[0] : data.dish) as { name?: string } | null;
    const kitchen = (Array.isArray(data.kitchen) ? data.kitchen[0] : data.kitchen) as { name?: string } | null;
    await notifyUsers({
      tenantId: data.tenant_id as string,
      profileIds: [data.profile_id as string],
      category: "general",
      title: `Your ${data.meal_period} is ready`,
      body: `${dish?.name ?? "Your meal"}${kitchen?.name ? ` at ${kitchen.name}` : ""} is packed and waiting for you.`,
      url: "/canteen",
    });
  }

  revalidatePath("/canteen/campboss");
  revalidatePath("/canteen/serving");
  return { ok: true };
}

/**
 * Campboss checks one visitor plate off (delta +1) as the visitor arrives, or
 * undoes it (delta -1). Visitors are collected independently of the host's own
 * plate (collected_at), so a guest who comes separately is deducted on arrival
 * rather than assumed served with the host. Clamped to 0..guest_count; the
 * canteen_bookings check constraint is the backstop.
 */
export async function setGuestCollected(
  bookingId: string,
  delta: 1 | -1,
): Promise<ActionResult> {
  const gate = await requireModule("canteen", "operate", (a) => a.isCanteenStaff);
  if (gate) return gate;
  const supabase = createClient();
  const { data: b, error: readErr } = await supabase
    .from("canteen_bookings")
    .select("guest_count, collected_guest_count")
    .eq("id", bookingId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!b) return { ok: false, error: "Booking not found." };

  const next = Math.max(0, Math.min(b.guest_count, b.collected_guest_count + delta));
  if (next === b.collected_guest_count) {
    return {
      ok: false,
      error: delta > 0 ? "All visitor plates already served." : "No visitor plates to undo.",
    };
  }
  const { error } = await supabase
    .from("canteen_bookings")
    .update({ collected_guest_count: next })
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
  const gate = await requireModule("canteen", "operate", (a) => a.isCanteenStaff);
  if (gate) return gate;
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
