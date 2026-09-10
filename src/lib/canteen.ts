import { createClient } from "@/lib/supabase/server";
import { siteDate, siteMinutes } from "@/lib/visitors/daily";
import {
  MEAL_PERIODS,
  type CanteenDish,
  type CanteenBooking,
  type CanteenForecast,
  type DietProfile,
  type DishDemand,
  type DishOptionGroup,
  type DishRank,
  type RecentMeal,
  type RepeatNoShow,
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
    booked_plates: 0,
    change_note: row.change_note ?? null,
    is_active: row.is_active,
    option_groups: groups,
  };
}

/** Today's date in YYYY-MM-DD on the site's clock (Africa/Douala). */
export function today(): string {
  return siteDate(new Date().toISOString());
}

/** Whether same-day booking is closed right now, on the site's clock. */
export function bookingClosedNow(serviceDate: string, cutoffHour: number | null, nowIso: string = new Date().toISOString()): boolean {
  if (cutoffHour == null) return false;
  if (serviceDate < siteDate(nowIso)) return true;
  if (serviceDate !== siteDate(nowIso)) return false;
  return siteMinutes(nowIso) >= cutoffHour * 60;
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
  const [{ data, error }, { data: plates }] = await Promise.all([
    supabase.from("canteen_dishes").select(DISH_SELECT).eq("service_date", serviceDate).eq("is_active", true).order("name"),
    supabase.rpc("canteen_dish_plates_on", { p_date: serviceDate }),
  ]);

  if (error) {
    console.error("getMenu:", error.message);
    return [];
  }
  const booked = new Map<string, number>(((plates ?? []) as { dish_id: string; plates: number }[]).map((r) => [r.dish_id, Number(r.plates)]));
  return (data ?? []).map((row) => ({ ...mapDish(row as Record<string, any>), booked_plates: booked.get((row as unknown as { id: string }).id) ?? 0 }));
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

/** Days with a menu over the last `daysBack` days, newest first, with what was on them — for "bring an earlier menu here". */
export async function getMenuDates(daysBack = 120): Promise<{ date: string; dishes: number; names: string[] }[]> {
  const supabase = createClient();
  const since = addDays(today(), -daysBack);
  const { data } = await supabase
    .from("canteen_dishes")
    .select("service_date, name")
    .gte("service_date", since)
    .eq("is_active", true)
    .order("service_date", { ascending: false })
    .limit(2000);
  const byDate = new Map<string, string[]>();
  for (const r of (data ?? []) as { service_date: string; name: string }[]) byDate.set(r.service_date, [...(byDate.get(r.service_date) ?? []), r.name]);
  return [...byDate.entries()].map(([date, names]) => ({ date, dishes: names.length, names: names.slice(0, 4) }));
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

/**
 * The current user's daily meal allowance for a date — the total plates (host +
 * visitors) they may consume. Mirrors public.canteen_daily_allowance: sum of
 * entitlement grants covering the date, else 1 for an active lunch-eligible
 * person, else 0.
 */
export async function getMyAllowance(serviceDate: string): Promise<number> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const [{ data: profile }, { data: grants }] = await Promise.all([
    supabase.from("profiles").select("is_active, lunch_eligible").eq("id", user.id).maybeSingle(),
    supabase
      .from("canteen_meal_entitlements")
      .select("daily_meals")
      .eq("profile_id", user.id)
      .lte("starts_on", serviceDate)
      .gte("ends_on", serviceDate),
  ]);
  const granted = (grants ?? []).reduce((s, g) => s + (g.daily_meals as number), 0);
  if (granted > 0) return granted;
  return profile?.is_active && profile?.lunch_eligible ? 1 : 0;
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
      guestsCollected: r?.collected_guest_count ?? 0,
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

/** What a meal costs, what the company pays, and the nudges — from canteen settings, with defaults. */
export async function getCanteenExtras(): Promise<{ costPerMeal: number; subsidyPerMeal: number; remindBeforeCutoffMinutes: number; menuOutHour: number; noShowWarningThreshold: number }> {
  const supabase = createClient();
  const { data } = await supabase
    .from("tenant_services")
    .select("settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "canteen")
    .maybeSingle();
  const st = (data?.settings as Record<string, unknown>) ?? {};
  return {
    costPerMeal: Number(st.cost_per_meal ?? 6),
    subsidyPerMeal: Number(st.subsidy_per_meal ?? 4),
    remindBeforeCutoffMinutes: Number(st.remind_before_cutoff_minutes ?? 60),
    menuOutHour: Number(st.menu_out_hour ?? 16),
    noShowWarningThreshold: Number(st.no_show_warning_threshold ?? 3),
  };
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

// --- Personal allergies -------------------------------------------------------

export async function getMyDiet(): Promise<DietProfile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { allergens: [], notes: null };
  const { data } = await supabase.from("canteen_diet_profiles").select("allergens, notes").eq("profile_id", user.id).maybeSingle();
  return { allergens: ((data?.allergens as string[] | null) ?? []).slice(), notes: (data?.notes as string | null) ?? null };
}

/** Allergies of everyone with a booking on a date, keyed by booking id — for the pack list. */
export async function getAllergiesForDate(serviceDate: string): Promise<Record<string, string[]>> {
  const supabase = createClient();
  const { data: bookings } = await supabase
    .from("canteen_bookings")
    .select("id, profile_id")
    .eq("service_date", serviceDate)
    .neq("status", "cancelled");
  const ids = [...new Set((bookings ?? []).map((b) => b.profile_id as string))];
  if (ids.length === 0) return {};
  const { data: diets } = await supabase.from("canteen_diet_profiles").select("profile_id, allergens").in("profile_id", ids);
  const byProfile = new Map((diets ?? []).map((d) => [d.profile_id as string, (d.allergens as string[]) ?? []]));
  const out: Record<string, string[]> = {};
  for (const b of bookings ?? []) {
    const a = byProfile.get(b.profile_id as string);
    if (a && a.length) out[b.id as string] = a;
  }
  return out;
}

// --- Feedback picker, dish ranking, repeat no-shows ------------------------------

/** The person's meals over the last two weeks, newest first, for "which meal was this about?". */
export async function getMyRecentMeals(): Promise<RecentMeal[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const since = addDays(today(), -14);
  const { data } = await supabase
    .from("canteen_lunch_history")
    .select("booking_id, service_date, dish_name, kitchen_name, outcome")
    .eq("profile_id", user.id)
    .gte("service_date", since)
    .lte("service_date", today())
    .neq("outcome", "cancelled")
    .order("service_date", { ascending: false })
    .limit(14);
  return (data ?? []) as RecentMeal[];
}

/** Dishes over the last `days`: bookings and ratings, most booked first. Admin-scoped via RLS. */
export async function getDishRanking(days = 30): Promise<DishRank[]> {
  const supabase = createClient();
  const since = addDays(today(), -days);
  const [{ data: hist }, { data: fb }] = await Promise.all([
    supabase.from("canteen_lunch_history").select("dish_id, dish_name, kitchen_name, outcome").gte("service_date", since).neq("outcome", "cancelled"),
    supabase.from("canteen_feedback").select("dish_id, food_quality, quantity_rating").gte("service_date", since).not("dish_id", "is", null),
  ]);
  const byDish = new Map<string, DishRank & { foodSum: number; foodN: number; qtySum: number; qtyN: number }>();
  const key = (r: { dish_name: string; kitchen_name: string }) => `${r.kitchen_name}|${r.dish_name}`;
  const idToKey = new Map<string, string>();
  for (const r of (hist ?? []) as { dish_id: string; dish_name: string; kitchen_name: string }[]) {
    const k = key(r);
    idToKey.set(r.dish_id, k);
    const cur = byDish.get(k) ?? { dish_name: r.dish_name, kitchen_name: r.kitchen_name, bookings: 0, ratings: 0, avg_food: null, avg_quantity: null, foodSum: 0, foodN: 0, qtySum: 0, qtyN: 0 };
    cur.bookings += 1;
    byDish.set(k, cur);
  }
  for (const f of (fb ?? []) as { dish_id: string; food_quality: number | null; quantity_rating: number | null }[]) {
    const k = idToKey.get(f.dish_id);
    if (!k) continue;
    const cur = byDish.get(k);
    if (!cur) continue;
    if (f.food_quality || f.quantity_rating) cur.ratings += 1;
    if (f.food_quality) {
      cur.foodSum += f.food_quality;
      cur.foodN += 1;
    }
    if (f.quantity_rating) {
      cur.qtySum += f.quantity_rating;
      cur.qtyN += 1;
    }
  }
  return [...byDish.values()]
    .map(({ foodSum, foodN, qtySum, qtyN, ...d }) => ({
      ...d,
      avg_food: foodN ? Math.round((foodSum / foodN) * 10) / 10 : null,
      avg_quantity: qtyN ? Math.round((qtySum / qtyN) * 10) / 10 : null,
    }))
    .sort((a, b) => b.bookings - a.bookings || a.dish_name.localeCompare(b.dish_name));
}

/** People with at least `min` missed bookings in the last `days`, worst first. Admin-scoped via RLS. */
export async function getRepeatNoShows(days = 30, min = 3): Promise<RepeatNoShow[]> {
  const supabase = createClient();
  const since = addDays(today(), -days);
  const { data } = await supabase
    .from("canteen_lunch_history")
    .select("profile_id, outcome")
    .gte("service_date", since)
    .in("outcome", ["missed", "collected"]);
  const tally = new Map<string, { missed: number; booked: number }>();
  for (const r of (data ?? []) as { profile_id: string; outcome: string }[]) {
    const t = tally.get(r.profile_id) ?? { missed: 0, booked: 0 };
    t.booked += 1;
    if (r.outcome === "missed") t.missed += 1;
    tally.set(r.profile_id, t);
  }
  const offenders = [...tally.entries()].filter(([, t]) => t.missed >= min);
  if (offenders.length === 0) return [];
  const { data: people } = await supabase.from("profiles").select("id, full_name, department").in("id", offenders.map(([id]) => id));
  const names = new Map((people ?? []).map((p) => [p.id as string, p]));
  return offenders
    .map(([id, t]) => ({
      profile_id: id,
      name: (names.get(id)?.full_name as string | null) ?? "—",
      department: (names.get(id)?.department as string | null) ?? null,
      missed: t.missed,
      booked: t.booked,
    }))
    .sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name));
}
