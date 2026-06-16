import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/canteen";
import type {
  EntitlementCandidate,
  MealEntitlement,
  MealEntitlementExtra,
  MealRedemptionRow,
} from "@/types/canteen";

/** Mon–Fri is a working day; weekends carry no entitlement. */
export function isWorkingDay(isoDate: string): boolean {
  const day = new Date(isoDate + "T00:00:00").getDay(); // 0=Sun … 6=Sat
  return day >= 1 && day <= 5;
}

/** Embedded to-one rows can arrive as an object or a single-element array. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type ProfileLite = {
  full_name: string | null;
  email: string;
  job_title: string | null;
};

/** The HR roster: every entitlement in the tenant with the employee's details. */
export async function getEntitlementRoster(): Promise<MealEntitlement[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("canteen_meal_entitlements")
    .select(
      "id, profile_id, daily_meals, is_active, notes, last_renewed_on, profiles!profile_id(full_name, email, job_title)",
    )
    .order("created_at", { ascending: true });

  return (data ?? []).map((r) => {
    const p = one<ProfileLite>(r.profiles as never);
    return {
      id: r.id as string,
      profile_id: r.profile_id as string,
      full_name: p?.full_name ?? null,
      email: p?.email ?? "",
      job_title: p?.job_title ?? null,
      daily_meals: r.daily_meals as number,
      is_active: r.is_active as boolean,
      notes: (r.notes as string | null) ?? null,
      last_renewed_on: (r.last_renewed_on as string | null) ?? null,
    };
  });
}

/** Visitor extras that are current or upcoming (have not yet ended). */
export async function getActiveExtras(): Promise<MealEntitlementExtra[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("canteen_meal_entitlement_extras")
    .select(
      "id, profile_id, extra_meals, reason, starts_on, ends_on, profiles!profile_id(full_name, email)",
    )
    .gte("ends_on", today())
    .order("starts_on", { ascending: true });

  return (data ?? []).map((r) => {
    const p = one<ProfileLite>(r.profiles as never);
    return {
      id: r.id as string,
      profile_id: r.profile_id as string,
      full_name: p?.full_name ?? null,
      email: p?.email ?? "",
      extra_meals: r.extra_meals as number,
      reason: (r.reason as string | null) ?? null,
      starts_on: r.starts_on as string,
      ends_on: r.ends_on as string,
    };
  });
}

/** Active employees in the tenant who are not yet on the entitlement roster. */
export async function getEntitlementCandidates(): Promise<EntitlementCandidate[]> {
  const supabase = createClient();
  const [{ data: profiles }, roster] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, job_title")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    getEntitlementRoster(),
  ]);
  const taken = new Set(roster.map((e) => e.profile_id));
  return (profiles ?? [])
    .filter((p) => !taken.has(p.id as string))
    .map((p) => ({
      id: p.id as string,
      full_name: (p.full_name as string | null) ?? null,
      email: p.email as string,
      job_title: (p.job_title as string | null) ?? null,
    }));
}

/**
 * The serving-point board for a given day: every actively-entitled employee
 * with their effective allowance (base + any visitor extra active today) and
 * how many meals they have already taken.
 */
export async function getRedemptionBoard(
  serviceDate: string,
): Promise<MealRedemptionRow[]> {
  const supabase = createClient();
  const working = isWorkingDay(serviceDate);

  const [roster, { data: extras }, { data: redemptions }] = await Promise.all([
    getEntitlementRoster(),
    supabase
      .from("canteen_meal_entitlement_extras")
      .select("profile_id, extra_meals")
      .lte("starts_on", serviceDate)
      .gte("ends_on", serviceDate),
    supabase
      .from("canteen_meal_redemptions")
      .select("profile_id")
      .eq("redeemed_on", serviceDate),
  ]);

  const extraByProfile = new Map<string, number>();
  for (const x of extras ?? []) {
    const id = x.profile_id as string;
    extraByProfile.set(id, (extraByProfile.get(id) ?? 0) + (x.extra_meals as number));
  }
  const usedByProfile = new Map<string, number>();
  for (const r of redemptions ?? []) {
    const id = r.profile_id as string;
    usedByProfile.set(id, (usedByProfile.get(id) ?? 0) + 1);
  }

  return roster
    .filter((e) => e.is_active)
    .map((e) => {
      const base = working ? e.daily_meals : 0;
      const extra = working ? extraByProfile.get(e.profile_id) ?? 0 : 0;
      const effective = base + extra;
      const used = usedByProfile.get(e.profile_id) ?? 0;
      return {
        profile_id: e.profile_id,
        full_name: e.full_name,
        email: e.email,
        job_title: e.job_title,
        effective,
        used,
        remaining: Math.max(0, effective - used),
      };
    })
    .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));
}
