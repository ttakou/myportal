"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/permissions-server";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

/**
 * Book a dish for the current user. Honours the 1-dish-per-meal rule by
 * cancelling any existing active booking for the same meal/date first, so a
 * user can freely switch dishes (even across kitchens) for a given meal.
 */
export async function bookDish(
  dishId: string,
  guestCount = 0,
  guestNames: string[] = [],
  optionIds: string[] = [],
): Promise<ActionResult> {
  const gate = await requireModule("canteen", "create");
  if (gate) return gate;
  const supabase = createClient();

  // Atomic: validates option rules, enforces the 1-dish rule, and records
  // the booking + selected options in a single transaction (see canteen_book).
  const { error } = await supabase.rpc("canteen_book", {
    p_dish_id: dishId,
    p_guest_count: Math.max(0, Math.min(10, guestCount)),
    p_guest_names: guestNames.slice(0, Math.max(0, Math.min(10, guestCount))),
    p_option_ids: optionIds,
  });

  if (error) {
    // Surface the friendly message raised by the function (e.g. "Choose at least 1…").
    return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
  }

  revalidatePath("/canteen");
  return { ok: true };
}

/** Finalise the current user's booking — locks it (no further changes). */
export async function finalizeBooking(bookingId: string): Promise<ActionResult> {
  const gate = await requireModule("canteen", "edit");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase
    .from("canteen_bookings")
    .update({ finalized_at: new Date().toISOString() })
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
  revalidatePath("/canteen");
  return { ok: true };
}

/** Cancel one of the current user's bookings. */
export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  const gate = await requireModule("canteen", "edit");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase
    .from("canteen_bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/canteen");
  return { ok: true };
}

/** Update guest seats on an existing booking. */
export async function updateGuests(
  bookingId: string,
  guestCount: number,
  guestNames: string[] = [],
): Promise<ActionResult> {
  const gate = await requireModule("canteen", "edit");
  if (gate) return gate;
  const supabase = createClient();
  const clamped = Math.max(0, Math.min(10, guestCount));
  const { error } = await supabase
    .from("canteen_bookings")
    .update({ guest_count: clamped, guest_names: guestNames.slice(0, clamped) })
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath("/canteen");
  return { ok: true };
}
