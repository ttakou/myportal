"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Book a dish for the current user. Honours the 1-dish-per-meal rule by
 * cancelling any existing active booking for the same meal/date first, so a
 * user can freely switch dishes (even across kitchens) for a given meal.
 */
export async function bookDish(
  dishId: string,
  guestCount = 0,
  guestNames: string[] = [],
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Look up the dish to find which meal/date this booking occupies.
  const { data: dish, error: dishErr } = await supabase
    .from("canteen_dishes")
    .select("service_date, meal_period, is_active")
    .eq("id", dishId)
    .maybeSingle();

  if (dishErr || !dish) return { ok: false, error: "Dish not found." };
  if (!dish.is_active) return { ok: false, error: "That dish is no longer available." };

  // Release any current booking for this meal so the unique index won't reject us.
  const { error: cancelErr } = await supabase
    .from("canteen_bookings")
    .update({ status: "cancelled" })
    .eq("profile_id", user.id)
    .eq("service_date", dish.service_date)
    .eq("meal_period", dish.meal_period)
    .neq("status", "cancelled");
  if (cancelErr) return { ok: false, error: cancelErr.message };

  const clampedGuests = Math.max(0, Math.min(10, guestCount));
  const { error: insertErr } = await supabase.from("canteen_bookings").insert({
    dish_id: dishId,
    guest_count: clampedGuests,
    guest_names: guestNames.slice(0, clampedGuests),
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  revalidatePath("/canteen");
  return { ok: true };
}

/** Cancel one of the current user's bookings. */
export async function cancelBooking(bookingId: string): Promise<ActionResult> {
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
  const supabase = createClient();
  const clamped = Math.max(0, Math.min(10, guestCount));
  const { error } = await supabase
    .from("canteen_bookings")
    .update({ guest_count: clamped, guest_names: guestNames.slice(0, clamped) })
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/canteen");
  return { ok: true };
}
