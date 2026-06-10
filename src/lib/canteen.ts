import { createClient } from "@/lib/supabase/server";
import type { CanteenDish, CanteenBooking, DishDemand } from "@/types/canteen";

/** Today's date in YYYY-MM-DD (server local). */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Validate/normalize a `?date=` param, falling back to today. */
export function resolveServiceDate(input?: string): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  return today();
}

/** Active menu for a service date, ordered by kitchen then dish name. */
export async function getMenu(serviceDate: string): Promise<CanteenDish[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("canteen_dishes")
    .select("id, kitchen_id, service_date, meal_period, name, description, capacity, is_active, canteen_kitchens!inner(name, kind)")
    .eq("service_date", serviceDate)
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("getMenu:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const k = Array.isArray(row.canteen_kitchens)
      ? row.canteen_kitchens[0]
      : row.canteen_kitchens;
    return {
      id: row.id,
      kitchen_id: row.kitchen_id,
      kitchen_kind: k?.kind,
      kitchen_name: k?.name,
      service_date: row.service_date,
      meal_period: row.meal_period,
      name: row.name,
      description: row.description,
      capacity: row.capacity,
      is_active: row.is_active,
    } as CanteenDish;
  });
}

/** The current user's active bookings for a service date. */
export async function getMyBookings(serviceDate: string): Promise<CanteenBooking[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("canteen_bookings")
    .select("id, dish_id, kitchen_id, service_date, meal_period, guest_count, guest_names, status")
    .eq("profile_id", user.id)
    .eq("service_date", serviceDate)
    .neq("status", "cancelled");

  if (error) {
    console.error("getMyBookings:", error.message);
    return [];
  }
  return (data ?? []) as CanteenBooking[];
}

/** Demand summary for the campboss dashboard (admin-scoped via RLS). */
export async function getDishDemand(serviceDate: string): Promise<DishDemand[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("canteen_dish_demand")
    .select("*")
    .eq("service_date", serviceDate)
    .order("meal_period")
    .order("kitchen_name");

  if (error) {
    console.error("getDishDemand:", error.message);
    return [];
  }
  return (data ?? []) as DishDemand[];
}
