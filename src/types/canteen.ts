export type KitchenKind = "local" | "chinese";
export type MealPeriod = "breakfast" | "lunch" | "dinner";
export type BookingStatus = "booked" | "served" | "cancelled";

export const MEAL_PERIODS: MealPeriod[] = ["breakfast", "lunch", "dinner"];

export const MEAL_PERIOD_LABEL: Record<MealPeriod, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

export const KITCHEN_LABEL: Record<KitchenKind, string> = {
  local: "Local Kitchen",
  chinese: "Chinese Kitchen",
};

export interface CanteenDish {
  id: string;
  kitchen_id: string;
  kitchen_kind: KitchenKind;
  kitchen_name: string;
  service_date: string;
  meal_period: MealPeriod;
  name: string;
  description: string | null;
  capacity: number | null;
  is_active: boolean;
}

export interface CanteenBooking {
  id: string;
  dish_id: string;
  kitchen_id: string;
  service_date: string;
  meal_period: MealPeriod;
  guest_count: number;
  guest_names: string[];
  status: BookingStatus;
}

/** A row of the canteen_dish_demand view — powers the campboss dashboard. */
export interface DishDemand {
  dish_id: string;
  service_date: string;
  meal_period: MealPeriod;
  dish_name: string;
  capacity: number | null;
  kitchen_id: string;
  kitchen_name: string;
  kitchen_kind: KitchenKind;
  headcount: number;
  guests: number;
  total_covers: number;
}
