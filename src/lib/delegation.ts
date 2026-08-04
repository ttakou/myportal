import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth";

/**
 * Access delegation — a user lets a colleague act with their access for a
 * bounded period. The delegate keeps their own identity; their effective
 * permissions become the UNION of their own and any active delegators'
 * (admin/privileged roles excluded — enforced in the DB, see migration 0159).
 */

export type DelegationStatus = "active" | "upcoming" | "expired" | "revoked";

export interface DelegationRow {
  id: string;
  delegator_id: string;
  delegate_id: string;
  delegator_name: string;
  delegate_name: string;
  starts_on: string;
  ends_on: string;
  note: string | null;
  revoked_at: string | null;
  status: DelegationStatus;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * The ids of everyone who has delegated their access to the current user right
 * now. Request-cached because the auth / permission helpers all consult it.
 */
export const getActiveDelegatorIds = cache(async (): Promise<string[]> => {
  const user = await getCachedUser();
  if (!user) return [];
  const supabase = createClient();
  const today = todayIso();
  const { data } = await supabase
    .from("access_delegations")
    .select("delegator_id")
    .eq("delegate_id", user.id)
    .is("revoked_at", null)
    .lte("starts_on", today)
    .gte("ends_on", today);
  return [...new Set((data ?? []).map((r) => r.delegator_id as string))];
});

function nameOf(rel: unknown): string {
  const r = (Array.isArray(rel) ? rel[0] : rel) as { full_name?: string | null; email?: string | null } | null;
  return r?.full_name || r?.email || "—";
}

function statusOf(row: { starts_on: string; ends_on: string; revoked_at: string | null }): DelegationStatus {
  if (row.revoked_at) return "revoked";
  const today = todayIso();
  if (today < row.starts_on) return "upcoming";
  if (today > row.ends_on) return "expired";
  return "active";
}

const SELECT =
  "id, delegator_id, delegate_id, starts_on, ends_on, note, revoked_at," +
  " delegator:profiles!delegator_id(full_name, email)," +
  " delegate:profiles!delegate_id(full_name, email)";

function mapRow(r: Record<string, any>): DelegationRow {
  return {
    id: r.id,
    delegator_id: r.delegator_id,
    delegate_id: r.delegate_id,
    delegator_name: nameOf(r.delegator),
    delegate_name: nameOf(r.delegate),
    starts_on: r.starts_on,
    ends_on: r.ends_on,
    note: r.note ?? null,
    revoked_at: r.revoked_at ?? null,
    status: statusOf({ starts_on: r.starts_on, ends_on: r.ends_on, revoked_at: r.revoked_at ?? null }),
  };
}

/** Delegations the current user has GRANTED to others (newest first). */
export async function getMyOutgoingDelegations(): Promise<DelegationRow[]> {
  const user = await getCachedUser();
  if (!user) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("access_delegations")
    .select(SELECT)
    .eq("delegator_id", user.id)
    .order("starts_on", { ascending: false });
  return (data ?? []).map((r) => mapRow(r as Record<string, any>));
}

/** Delegations the current user has RECEIVED (active or upcoming). */
export async function getMyIncomingDelegations(): Promise<DelegationRow[]> {
  const user = await getCachedUser();
  if (!user) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("access_delegations")
    .select(SELECT)
    .eq("delegate_id", user.id)
    .is("revoked_at", null)
    .gte("ends_on", todayIso())
    .order("starts_on", { ascending: false });
  return (data ?? []).map((r) => mapRow(r as Record<string, any>));
}

/** Active tenant colleagues a user can delegate to (excludes themselves). */
export async function getDelegatableUsers(): Promise<{ id: string; name: string }[]> {
  const user = await getCachedUser();
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("is_active", true)
    .order("full_name");
  return (data ?? [])
    .filter((p) => p.id !== user?.id)
    .map((p) => ({ id: p.id as string, name: (p.full_name as string) || (p.email as string) || "—" }));
}
