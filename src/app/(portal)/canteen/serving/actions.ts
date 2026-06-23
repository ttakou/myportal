"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { today } from "@/lib/canteen";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EmployeeOption {
  id: string;
  name: string;
  email: string | null;
  lunch_eligible: boolean;
}

/**
 * Typeahead search for the serving point: match active employees by name or
 * email so staff can pick someone from a list instead of typing an exact
 * address. RLS (`profiles_select_same_tenant`) scopes results to the tenant.
 */
export async function searchEmployees(query: string): Promise<EmployeeOption[]> {
  if (!(await getAccess()).isCanteenStaff) return [];
  const q = query.trim().replace(/[%_,()]/g, " ").trim();
  if (q.length < 2) return [];

  const supabase = createClient();
  const like = `%${q}%`;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, lunch_eligible")
    .eq("is_active", true)
    .or(`full_name.ilike.${like},email.ilike.${like}`)
    .order("full_name")
    .limit(8);
  if (error) return [];

  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string | null) ?? (p.email as string | null) ?? "(no name)",
    email: (p.email as string | null) ?? null,
    lunch_eligible: !!p.lunch_eligible,
  }));
}

export interface WalkinLookup {
  ok: boolean;
  error?: string;
  person?: { id: string; name: string; email: string; allowance: number };
}

/**
 * Resolve a scanned/typed identifier (employee email or profile id) to an
 * *entitled* employee for walk-in service.
 *
 * Entitlement = active + lunch_eligible — the same gate the booking flow uses
 * (see `canteen_book`). RLS (`profiles_select_same_tenant`) scopes the lookup
 * to the serving staff member's tenant, so a match is always same-tenant.
 */
export async function lookupWalkin(identifier: string): Promise<WalkinLookup> {
  if (!(await getAccess()).isCanteenStaff) return { ok: false, error: "Not authorized." };

  const id = identifier.trim();
  if (!id) return { ok: false, error: "Enter an employee email or badge." };

  const supabase = createClient();
  const base = supabase
    .from("profiles")
    .select("id, full_name, email, is_active, lunch_eligible");
  const { data, error } = await (UUID_RE.test(id)
    ? base.eq("id", id)
    : base.ilike("email", id)
  ).maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: `No employee found for "${identifier}".` };

  const name = data.full_name ?? data.email;
  if (!data.is_active) return { ok: false, error: `${name} is inactive.` };
  if (!data.lunch_eligible)
    return { ok: false, error: `${name} is not entitled to lunch. Contact HR.` };

  // The person's own meal allowance for today, so the serving point can flag
  // visitor plates that go beyond it. Mirrors public.canteen_daily_allowance:
  // sum of grants covering the date, else 1 (active + lunch-eligible, verified
  // above). Visitors are extra plates and are never part of this allowance.
  const date = today();
  const { data: grants } = await supabase
    .from("canteen_meal_entitlements")
    .select("daily_meals")
    .eq("profile_id", data.id)
    .lte("starts_on", date)
    .gte("ends_on", date);
  const granted = (grants ?? []).reduce((s, g) => s + (g.daily_meals as number), 0);
  const allowance = granted > 0 ? granted : 1;

  return { ok: true, person: { id: data.id, name, email: data.email, allowance } };
}

export interface ServeResult {
  ok: boolean;
  error?: string;
  served?: { name: string; dish: string };
}

/**
 * Serve an entitled walk-in who has no booking: record a booking for the chosen
 * dish already marked collected. If the employee *does* have an open booking
 * for that meal, that one is served instead of creating a duplicate.
 *
 * Runs as the staff member: the `is_canteen_staff()` write policy permits
 * booking on another employee's behalf, and the audit trail attributes it to
 * the staff member (not service-role).
 */
export async function serveWalkin(
  profileId: string,
  dishId: string,
  guestCount = 0,
): Promise<ServeResult> {
  if (!(await getAccess()).isCanteenStaff) return { ok: false, error: "Not authorized." };

  const supabase = createClient();
  const date = today();
  const now = new Date().toISOString();
  const guests = Math.max(0, Math.min(20, Math.round(guestCount)));

  // Re-check entitlement server-side (defence in depth — never trust the client).
  const { data: emp } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_active, lunch_eligible")
    .eq("id", profileId)
    .maybeSingle();
  if (!emp) return { ok: false, error: "Employee not found." };
  const name = emp.full_name ?? emp.email;
  if (!emp.is_active || !emp.lunch_eligible)
    return { ok: false, error: `${name} is not entitled to lunch.` };

  // Plates (the person + visitors) may not exceed the person's meal allowance.
  // Mirror public.canteen_daily_allowance (sum of grants covering the date, else
  // 1 for an active lunch-eligible person, verified above). Reject over-serves
  // here too, so a stale client can't push visitor plates past the entitlement.
  const { data: grants } = await supabase
    .from("canteen_meal_entitlements")
    .select("daily_meals")
    .eq("profile_id", profileId)
    .lte("starts_on", date)
    .gte("ends_on", date);
  const granted = (grants ?? []).reduce((s, g) => s + (g.daily_meals as number), 0);
  const allowance = granted > 0 ? granted : 1;
  if (1 + guests > allowance) {
    return {
      ok: false,
      error: `${name} is entitled to ${allowance} meal${allowance === 1 ? "" : "s"}/day — ${guests} visitor${guests === 1 ? "" : "s"} would exceed it. Reduce visitors to ${Math.max(0, allowance - 1)} or fewer.`,
    };
  }

  // The dish must be on today's active menu (RLS scopes this to the tenant).
  const { data: dish } = await supabase
    .from("canteen_dishes")
    .select("id, kitchen_id, tenant_id, service_date, meal_period, name, is_active")
    .eq("id", dishId)
    .maybeSingle();
  if (!dish || !dish.is_active || dish.service_date !== date)
    return { ok: false, error: "That meal isn't available today." };

  // Reuse an existing open booking for this meal rather than duplicating it.
  const { data: existing } = await supabase
    .from("canteen_bookings")
    .select("id, collected_at")
    .eq("profile_id", profileId)
    .eq("service_date", date)
    .eq("meal_period", dish.meal_period)
    .neq("status", "cancelled")
    .maybeSingle();

  if (existing) {
    if (existing.collected_at) return { ok: false, error: `${name} already collected.` };
    const { error } = await supabase
      .from("canteen_bookings")
      .update({
        status: "served",
        collected_at: now,
        prepared_at: now,
        // Visitors present at a walk-in serve are handed their plate now, so
        // record them as collected too. Guests who come later are checked off
        // separately via setGuestCollected.
        ...(guests > 0 ? { guest_count: guests, collected_guest_count: guests } : {}),
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("canteen_bookings").insert({
      profile_id: profileId,
      dish_id: dishId,
      tenant_id: dish.tenant_id,
      kitchen_id: dish.kitchen_id,
      service_date: dish.service_date,
      meal_period: dish.meal_period,
      guest_count: guests,
      collected_guest_count: guests,
      status: "served",
      prepared_at: now,
      collected_at: now,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/canteen/serving");
  revalidatePath("/canteen/campboss");
  return { ok: true, served: { name, dish: dish.name } };
}
