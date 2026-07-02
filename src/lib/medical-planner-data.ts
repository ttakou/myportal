import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanCandidate } from "@/lib/medical-planner";

const DAY_MS = 86_400_000;

/** Expand a training session's [start, end] into inclusive ISO dates (capped). */
function sessionDates(startsAt: string | null, endsAt: string | null): string[] {
  if (!startsAt) return [];
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : start;
  const out: string[] = [];
  for (let t = start.getTime(); t <= end.getTime() && out.length < 60; t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

const APCC_ROLE_NAME = "APCC Staff";
// Training states that actually block a person's calendar.
const ACTIVE_SESSION_STATES = ["planned", "open", "in_progress"];
const ACTIVE_PARTICIPANT_STATES = ["enrolled", "attended", "passed"]; // not cancelled/no_show

/**
 * Build the candidate list for a tenant's medical campaign: the APCC Staff
 * cohort, each with their crew rotation, training-busy dates and medical expiry.
 * Uses the service role (the caller is permission-gated in the action) and is
 * strictly scoped to `tenantId`.
 */
export async function getCampaignCandidates(tenantId: string): Promise<PlanCandidate[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  // Cohort: APCC Staff role holders in this tenant.
  const { data: roleRows } = await admin
    .from("profile_access_roles")
    .select("profile_id, tenant_roles!inner(name)")
    .eq("tenant_id", tenantId)
    .eq("tenant_roles.name", APCC_ROLE_NAME);
  const ids = [...new Set((roleRows ?? []).map((r: Record<string, unknown>) => r.profile_id as string))];
  if (ids.length === 0) return [];

  const [{ data: profs }, { data: staff }, { data: parts }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email").in("id", ids),
    admin
      .from("offshore_staff")
      .select("profile_id, medical_expiry, offshore_crews(cycle_start_date, offshore_days, onshore_days, is_active)")
      .eq("tenant_id", tenantId)
      .in("profile_id", ids),
    admin
      .from("training_participants")
      .select("profile_id, status, training_sessions!inner(starts_at, ends_at, status)")
      .in("profile_id", ids)
      .in("status", ACTIVE_PARTICIPANT_STATES),
  ]);

  const staffById = new Map<string, Record<string, any>>();
  for (const s of staff ?? []) staffById.set((s as Record<string, any>).profile_id, s as Record<string, any>);

  const busyById = new Map<string, Set<string>>();
  for (const p of (parts ?? []) as Record<string, any>[]) {
    const s = Array.isArray(p.training_sessions) ? p.training_sessions[0] : p.training_sessions;
    if (!s || !ACTIVE_SESSION_STATES.includes(s.status)) continue;
    const set = busyById.get(p.profile_id) ?? new Set<string>();
    for (const day of sessionDates(s.starts_at, s.ends_at)) set.add(day);
    busyById.set(p.profile_id, set);
  }

  return (profs ?? []).map((p: Record<string, any>) => {
    const s = staffById.get(p.id);
    const crewRel = s && (Array.isArray(s.offshore_crews) ? s.offshore_crews[0] : s.offshore_crews);
    const crew =
      crewRel && crewRel.is_active && crewRel.cycle_start_date
        ? {
            cycleStart: crewRel.cycle_start_date as string,
            offshoreDays: crewRel.offshore_days as number,
            onshoreDays: crewRel.onshore_days as number,
          }
        : null;
    return {
      profileId: p.id as string,
      name: (p.full_name as string | null) ?? (p.email as string | null) ?? "Unknown",
      crew,
      busyDates: [...(busyById.get(p.id) ?? [])],
      medicalExpiry: (s?.medical_expiry as string | null) ?? null,
    } satisfies PlanCandidate;
  });
}

/** Single candidate (crew + training-busy) for a manually-added staff member. */
export async function getCandidateInfo(
  tenantId: string,
  profileId: string,
): Promise<PlanCandidate | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const [{ data: p }, { data: s }, { data: parts }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email").eq("id", profileId).maybeSingle(),
    admin
      .from("offshore_staff")
      .select("profile_id, medical_expiry, offshore_crews(cycle_start_date, offshore_days, onshore_days, is_active)")
      .eq("tenant_id", tenantId)
      .eq("profile_id", profileId)
      .maybeSingle(),
    admin
      .from("training_participants")
      .select("status, training_sessions!inner(starts_at, ends_at, status)")
      .eq("profile_id", profileId)
      .in("status", ACTIVE_PARTICIPANT_STATES),
  ]);
  if (!p) return null;

  const busy = new Set<string>();
  for (const row of (parts ?? []) as Record<string, any>[]) {
    const ses = Array.isArray(row.training_sessions) ? row.training_sessions[0] : row.training_sessions;
    if (!ses || !ACTIVE_SESSION_STATES.includes(ses.status)) continue;
    for (const day of sessionDates(ses.starts_at, ses.ends_at)) busy.add(day);
  }
  const crewRel = s && (Array.isArray((s as any).offshore_crews) ? (s as any).offshore_crews[0] : (s as any).offshore_crews);
  const crew =
    crewRel && crewRel.is_active && crewRel.cycle_start_date
      ? {
          cycleStart: crewRel.cycle_start_date as string,
          offshoreDays: crewRel.offshore_days as number,
          onshoreDays: crewRel.onshore_days as number,
        }
      : null;
  return {
    profileId: (p as any).id as string,
    name: ((p as any).full_name as string | null) ?? ((p as any).email as string | null) ?? "Unknown",
    crew,
    busyDates: [...busy],
    medicalExpiry: ((s as any)?.medical_expiry as string | null) ?? null,
  };
}
