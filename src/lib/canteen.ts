import { createClient } from "@/lib/supabase/server";
import type {
  CanteenDish,
  CanteenBooking,
  DishDemand,
  DishOptionGroup,
  OptionDemand,
} from "@/types/canteen";

const DISH_SELECT =
  "id, kitchen_id, service_date, meal_period, name, description, capacity, is_active," +
  " canteen_kitchens!inner(name, kind)," +
  " canteen_option_groups(id, name, min_select, max_select, sort_order," +
  " canteen_options(id, name, is_active, sort_order))";

function mapDish(row: Record<string, any>): CanteenDish {
  const k = Array.isArray(row.canteen_kitchens)
    ? row.canteen_kitchens[0]
    : row.canteen_kitchens;
  const groups: DishOptionGroup[] = (row.canteen_option_groups ?? [])
    .slice()
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((g: Record<string, any>) => ({
      id: g.id,
      name: g.name,
      min_select: g.min_select,
      max_select: g.max_select,
      options: (g.canteen_options ?? [])
        .filter((o: Record<string, any>) => o.is_active)
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((o: Record<string, any>) => ({ id: o.id, name: o.name })),
    }));
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
    option_groups: groups,
  };
}

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
    .select(DISH_SELECT)
    .eq("service_date", serviceDate)
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("getMenu:", error.message);
    return [];
  }
  return (data ?? []).map((row) => mapDish(row as Record<string, any>));
}

export interface Kitchen {
  id: string;
  name: string;
  kind: "local" | "chinese";
  is_active: boolean;
}

/** Active kitchens for the current tenant. */
export async function getKitchens(): Promise<Kitchen[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("canteen_kitchens")
    .select("id, name, kind, is_active")
    .eq("is_active", true)
    .order("kind");
  if (error) {
    console.error("getKitchens:", error.message);
    return [];
  }
  return (data ?? []) as Kitchen[];
}

/** All dishes (active + inactive) for a date — for the management screen. */
export async function getManagedDishes(serviceDate: string): Promise<CanteenDish[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("canteen_dishes")
    .select(DISH_SELECT)
    .eq("service_date", serviceDate)
    .order("name");
  if (error) {
    console.error("getManagedDishes:", error.message);
    return [];
  }
  return (data ?? []).map((row) => mapDish(row as Record<string, any>));
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
    .select(
      "id, dish_id, kitchen_id, service_date, meal_period, guest_count, guest_names, status," +
        " canteen_booking_options(canteen_options(id, name))",
    )
    .eq("profile_id", user.id)
    .eq("service_date", serviceDate)
    .neq("status", "cancelled");

  if (error) {
    console.error("getMyBookings:", error.message);
    return [];
  }
  return (data ?? []).map((row: Record<string, any>) => ({
    id: row.id,
    dish_id: row.dish_id,
    kitchen_id: row.kitchen_id,
    service_date: row.service_date,
    meal_period: row.meal_period,
    guest_count: row.guest_count,
    guest_names: row.guest_names,
    status: row.status,
    selected_options: (row.canteen_booking_options ?? [])
      .map((bo: Record<string, any>) =>
        Array.isArray(bo.canteen_options) ? bo.canteen_options[0] : bo.canteen_options,
      )
      .filter(Boolean)
      .map((o: Record<string, any>) => ({ id: o.id, name: o.name })),
  }));
}

/** Per-option pick counts for the campboss (admin-scoped via RLS). */
export async function getOptionDemand(serviceDate: string): Promise<OptionDemand[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("canteen_option_demand")
    .select("*")
    .eq("service_date", serviceDate);
  if (error) {
    console.error("getOptionDemand:", error.message);
    return [];
  }
  return (data ?? []) as OptionDemand[];
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
