import { createClient } from "@/lib/supabase/server";
import {
  MEAL_PERIODS,
  type CanteenDish,
  type CanteenBooking,
  type CanteenForecast,
  type DishDemand,
  type DishOptionGroup,
  type EntitledPerson,
  type ForecastDay,
  type ForecastKitchen,
  type KitchenKind,
  type MealPeriod,
  type NoShowStat,
  type OptionDemand,
  type Reservation,
  type LunchHistoryRow,
} from "@/types/canteen";

/**
 * Which meal periods this tenant's canteen serves. Stored data-driven in the
 * canteen tenant_service settings (`meal_periods`). Defaults to lunch only.
 */
export async function getServedMealPeriods(): Promise<MealPeriod[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("tenant_services")
    .select("settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "canteen")
    .maybeSingle();
  const raw = (data?.settings as { meal_periods?: unknown })?.meal_periods;
  const valid = Array.isArray(raw)
    ? (raw.filter((m) => MEAL_PERIODS.includes(m as MealPeriod)) as MealPeriod[])
    : [];
  return valid.length ? valid : ["lunch"];
}

const DISH_SELECT =
  "id, kitchen_id, service_date, meal_period, name, description, ingredients, allergens, photo_url, capacity, available, change_note, is_active," +
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
    ingredients: row.ingredients ?? null,
    allergens: (row.allergens ?? []) as string[],
    photo_url: row.photo_url ?? null,
    capacity: row.capacity,
    available: row.available ?? true,
    change_note: row.change_note ?? null,
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

/** Shift a YYYY-MM-DD date by `days` (can be negative) → YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Forward plate forecast (today onward, `days` days) per kitchen from booked
 * demand, plus trailing no-show rates (booked-but-not-collected) over the last
 * `noShowWindowDays` — powers the campboss forecast screen. Admin-scoped via RLS.
 */
export async function getCanteenForecast(
  opts: { days?: number; noShowWindowDays?: number } = {},
): Promise<CanteenForecast> {
  const days = Math.max(1, Math.min(30, opts.days ?? 7));
  const noShowWindowDays = Math.max(1, Math.min(90, opts.noShowWindowDays ?? 30));
  const supabase = createClient();
  const start = today();
  const end = addDays(start, days - 1);
  const pastFrom = addDays(start, -noShowWindowDays);

  const [demandRes, historyRes] = await Promise.all([
    supabase
      .from("canteen_dish_demand")
      .select("service_date, kitchen_id, kitchen_name, kitchen_kind, headcount, guests")
      .gte("service_date", start)
      .lte("service_date", end),
    supabase
      .from("canteen_lunch_history")
      .select("kitchen_name, outcome, service_date")
      .gte("service_date", pastFrom)
      .lt("service_date", start),
  ]);

  // Forward plates: aggregate demand rows per day per kitchen.
  const byDate = new Map<string, Map<string, ForecastKitchen>>();
  for (const r of (demandRes.data ?? []) as Record<string, unknown>[]) {
    const date = String(r.service_date);
    const kid = String(r.kitchen_id);
    const head = Number(r.headcount ?? 0);
    const guests = Number(r.guests ?? 0);
    const dayMap = byDate.get(date) ?? new Map<string, ForecastKitchen>();
    const k = dayMap.get(kid) ?? {
      kitchenId: kid,
      kitchenName: String(r.kitchen_name ?? "—"),
      kitchenKind: (r.kitchen_kind as KitchenKind) ?? "local",
      headcount: 0,
      guests: 0,
      plates: 0,
    };
    k.headcount += head;
    k.guests += guests;
    k.plates += head + guests;
    dayMap.set(kid, k);
    byDate.set(date, dayMap);
  }

  const dayList: ForecastDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const kitchens = [...(byDate.get(date)?.values() ?? [])].sort((a, b) =>
      a.kitchenName.localeCompare(b.kitchenName),
    );
    dayList.push({
      date,
      isToday: date === start,
      plates: kitchens.reduce((s, k) => s + k.plates, 0),
      byKitchen: kitchens,
    });
  }

  // No-shows: collected vs missed per kitchen across the trailing window.
  const tally = new Map<string, { collected: number; missed: number }>();
  for (const r of (historyRes.data ?? []) as Record<string, unknown>[]) {
    const outcome = String(r.outcome);
    if (outcome !== "collected" && outcome !== "missed") continue;
    const name = String(r.kitchen_name ?? "—");
    const t = tally.get(name) ?? { collected: 0, missed: 0 };
    if (outcome === "collected") t.collected += 1;
    else t.missed += 1;
    tally.set(name, t);
  }
  const noShows: NoShowStat[] = [...tally.entries()]
    .map(([kitchenName, t]) => {
      const total = t.collected + t.missed;
      return {
        kitchenName,
        collected: t.collected,
        missed: t.missed,
        rate: total ? Math.round((t.missed / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.rate - a.rate || a.kitchenName.localeCompare(b.kitchenName));

  return { days: dayList, noShows, noShowWindowDays };
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
      "id, dish_id, kitchen_id, service_date, meal_period, guest_count, guest_names, status, prepared_at, finalized_at," +
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
    finalized_at: row.finalized_at ?? null,
    prepared_at: row.prepared_at ?? null,
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

/**
 * Everyone entitled to eat on a service date (active + lunch_eligible), with
 * their plate count (themselves + any booked visitors) and booking status —
 * powers the serving-point entitled roster / walk-in activation.
 */
export async function getEntitledToday(serviceDate: string): Promise<EntitledPerson[]> {
  const supabase = createClient();
  const [{ data: profiles }, reservations] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("is_active", true)
      .eq("lunch_eligible", true)
      .order("full_name", { ascending: true }),
    getReservations(serviceDate),
  ]);

  const byEmail = new Map(reservations.map((r) => [r.person_email.toLowerCase(), r]));
  return (profiles ?? []).map((p) => {
    const email = (p.email as string | null) ?? null;
    const r = email ? byEmail.get(email.toLowerCase()) : undefined;
    const guestCount = r?.guest_count ?? 0;
    return {
      profileId: p.id as string,
      name: (p.full_name as string | null) ?? email ?? "(no name)",
      email,
      guestCount,
      plates: 1 + guestCount,
      hasBooking: !!r,
      bookingId: r?.booking_id ?? null,
      collected: !!r?.collected_at,
      dishLabel: r ? `${r.kitchen_name} · ${r.dish_name}` : null,
    };
  });
}

/** Per-person reservations for the campboss pack list (admin-scoped via RLS). */
export async function getReservations(serviceDate: string): Promise<Reservation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("canteen_reservations")
    .select("*")
    .eq("service_date", serviceDate)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("getReservations:", error.message);
    return [];
  }
  return (data ?? []) as Reservation[];
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

/** The current user's lunch history (every booking, with derived outcome). */
export async function getMyLunchHistory(): Promise<LunchHistoryRow[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("canteen_lunch_history")
    .select("booking_id, service_date, meal_period, dish_name, kitchen_name, options, outcome")
    .eq("profile_id", user.id)
    .order("service_date", { ascending: false });
  if (error) {
    console.error("getMyLunchHistory:", error.message);
    return [];
  }
  return (data ?? []) as LunchHistoryRow[];
}

/** Same-day booking cutoff hour (0-23) from canteen settings, or null. */
export async function getCanteenCutoff(): Promise<number | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("tenant_services")
    .select("settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "canteen")
    .maybeSingle();
  const v = (data?.settings as { cutoff_hour?: unknown })?.cutoff_hour;
  return v === null || v === undefined || v === "" ? null : Number(v);
}
