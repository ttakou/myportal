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

export interface DishOption {
  id: string;
  name: string;
}

export interface DishOptionGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  options: DishOption[];
}

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
  option_groups: DishOptionGroup[];
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
  /** Set when the employee finalises their choice (then locked & green). */
  finalized_at: string | null;
  /** Set by the campboss when the meal is ready for collection. */
  prepared_at: string | null;
  selected_options: DishOption[];
}

/** A row of the canteen_option_demand view — per-option counts for the campboss. */
export interface OptionDemand {
  option_id: string;
  service_date: string;
  meal_period: MealPeriod;
  dish_id: string;
  dish_name: string;
  group_name: string;
  option_name: string;
  picks: number;
}

/** A per-person reservation (who reserved what) for the campboss pack list. */
export interface Reservation {
  booking_id: string;
  service_date: string;
  meal_period: MealPeriod;
  guest_count: number;
  prepared_at: string | null;
  finalized_at: string | null;
  person_name: string | null;
  person_email: string;
  dish_name: string;
  kitchen_name: string;
  kitchen_kind: KitchenKind;
  /** Comma-separated chosen options, e.g. "Meat, Rice". */
  options: string;
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
