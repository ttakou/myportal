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
  ingredients: string | null;
  allergens: string[];
  photo_url: string | null;
  capacity: number | null;
  available: boolean;
  change_note: string | null;
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
  collected_at: string | null;
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

export type LunchOutcome = "booked" | "collected" | "missed" | "cancelled";

export const LUNCH_OUTCOME_LABEL: Record<LunchOutcome, string> = {
  booked: "Booked",
  collected: "Collected",
  missed: "Missed",
  cancelled: "Cancelled",
};

export interface LunchHistoryRow {
  booking_id: string;
  service_date: string;
  meal_period: MealPeriod;
  dish_name: string;
  kitchen_name: string;
  options: string;
  outcome: LunchOutcome;
}

// --- Meal entitlements ------------------------------------------------------

/** A row of the HR roster: who is entitled to a meal per working day. */
export interface MealEntitlement {
  id: string;
  profile_id: string;
  full_name: string | null;
  email: string;
  job_title: string | null;
  daily_meals: number;
  is_active: boolean;
  notes: string | null;
  last_renewed_on: string | null;
}

/** A date-ranged top-up granted to a host employee for a visitor period. */
export interface MealEntitlementExtra {
  id: string;
  profile_id: string;
  full_name: string | null;
  email: string;
  extra_meals: number;
  reason: string | null;
  starts_on: string;
  ends_on: string;
}

/** One entitled person's standing on a given day, for the serving point. */
export interface MealRedemptionRow {
  profile_id: string;
  full_name: string | null;
  email: string;
  job_title: string | null;
  /** Base daily meals + any visitor extras active today. */
  effective: number;
  /** Meals already taken today. */
  used: number;
  /** effective − used, floored at 0. */
  remaining: number;
}

/** An employee available to be added to the entitlement roster. */
export interface EntitlementCandidate {
  id: string;
  full_name: string | null;
  email: string;
  job_title: string | null;
}
