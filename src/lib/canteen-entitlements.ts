import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/canteen";
import type {
  EntitlementCandidate,
  EntitlementStatus,
  MealEntitlement,
  MealRedemptionHistoryRow,
  MealRedemptionRow,
} from "@/types/canteen";
import { one } from "@/lib/supabase/row-helpers";

/** Mon–Fri is a working day; weekends carry no entitlement. */
export function isWorkingDay(isoDate: string): boolean {
  const day = new Date(isoDate + "T00:00:00").getDay(); // 0=Sun … 6=Sat
  return day >= 1 && day <= 5;
}

function statusFor(startsOn: string, endsOn: string, ref: string): EntitlementStatus {
  if (ref < startsOn) return "upcoming";
  if (ref > endsOn) return "expired";
  return "active";
}

type ProfileLite = {
  full_name: string | null;
  email: string;
  job_title: string | null;
};

/**
 * All entitlements in the tenant (current, upcoming and expired) with the
 * employee's details — newest period first, so history stays visible.
 */
export async function getEntitlements(): Promise<MealEntitlement[]> {
  const supabase = createClient();
  const ref = today();
  const { data } = await supabase
    .from("canteen_meal_entitlements")
    .select(
      "id, profile_id, daily_meals, starts_on, ends_on, reason, created_at," +
        " profiles!profile_id(full_name, email, job_title)," +
        " granter:profiles!granted_by(full_name)",
    )
    .order("starts_on", { ascending: false });

  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const p = one<ProfileLite>(r.profiles as ProfileLite | ProfileLite[] | null);
    const granter = one<{ full_name: string | null }>(r.granter);
    const starts_on = r.starts_on as string;
    const ends_on = r.ends_on as string;
    return {
      id: r.id as string,
      profile_id: r.profile_id as string,
      full_name: p?.full_name ?? null,
      email: p?.email ?? "",
      job_title: p?.job_title ?? null,
      daily_meals: r.daily_meals as number,
      starts_on,
      ends_on,
      reason: (r.reason as string | null) ?? null,
      status: statusFor(starts_on, ends_on, ref),
      granted_by_name: granter?.full_name ?? null,
      granted_at: r.created_at as string,
    };
  });
}

/**
 * Historical meal redemptions (allocations actually taken) over [from, to],
 * newest first — who ate, on which day, and who served it. RLS scopes rows to
 * the tenant. Capped to keep the page responsive.
 */
export async function getRedemptionHistory(
  from: string,
  to: string,
): Promise<MealRedemptionHistoryRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("canteen_meal_redemptions")
    .select(
      "id, profile_id, redeemed_on, note, created_at," +
        " eater:profiles!profile_id(full_name, email)," +
        " server:profiles!redeemed_by(full_name)",
    )
    .gte("redeemed_on", from)
    .lte("redeemed_on", to)
    .order("redeemed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);

  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const eater = one<{ full_name: string | null; email: string | null }>(r.eater);
    const server = one<{ full_name: string | null }>(r.server);
    return {
      id: r.id as string,
      profile_id: r.profile_id as string,
      full_name: eater?.full_name ?? null,
      email: eater?.email ?? "",
      redeemed_on: r.redeemed_on as string,
      served_by_name: server?.full_name ?? null,
      note: (r.note as string | null) ?? null,
      created_at: r.created_at as string,
    };
  });
}

/** Every active employee in the tenant, for the grant picker. */
export async function getActiveEmployees(): Promise<EntitlementCandidate[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, job_title")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  return (data ?? []).map((p) => ({
    id: p.id as string,
    full_name: (p.full_name as string | null) ?? null,
    email: p.email as string,
    job_title: (p.job_title as string | null) ?? null,
  }));
}

/**
 * The serving-point board for a given day: everyone whose entitlement grants
 * cover that date, with their effective allowance (sum of overlapping grants)
 * and how many meals they have already taken.
 */
export async function getRedemptionBoard(
  serviceDate: string,
): Promise<MealRedemptionRow[]> {
  const supabase = createClient();
  const working = isWorkingDay(serviceDate);

  const [{ data: grants }, { data: redemptions }] = await Promise.all([
    supabase
      .from("canteen_meal_entitlements")
      .select("profile_id, daily_meals, profiles!profile_id(full_name, email, job_title)")
      .lte("starts_on", serviceDate)
      .gte("ends_on", serviceDate),
    supabase
      .from("canteen_meal_redemptions")
      .select("profile_id")
      .eq("redeemed_on", serviceDate),
  ]);

  const usedByProfile = new Map<string, number>();
  for (const r of redemptions ?? []) {
    const id = r.profile_id as string;
    usedByProfile.set(id, (usedByProfile.get(id) ?? 0) + 1);
  }

  // Sum overlapping grants per person.
  const byProfile = new Map<string, MealRedemptionRow>();
  for (const g of grants ?? []) {
    const id = g.profile_id as string;
    const meals = working ? (g.daily_meals as number) : 0;
    const existing = byProfile.get(id);
    if (existing) {
      existing.effective += meals;
    } else {
      const p = one<ProfileLite>(g.profiles as ProfileLite | ProfileLite[] | null);
      byProfile.set(id, {
        profile_id: id,
        full_name: p?.full_name ?? null,
        email: p?.email ?? "",
        job_title: p?.job_title ?? null,
        effective: meals,
        used: 0,
        remaining: 0,
      });
    }
  }

  return [...byProfile.values()]
    .map((row) => {
      const used = usedByProfile.get(row.profile_id) ?? 0;
      return { ...row, used, remaining: Math.max(0, row.effective - used) };
    })
    .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));
}
