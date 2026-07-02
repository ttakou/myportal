import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TrainingCandidate } from "@/lib/training-planner";

export interface SchedulerEmployee {
  id: string;
  name: string;
  department: string | null;
  offshore: boolean;
}

/**
 * The pool the scheduler picks from: active tenant employees with their
 * department and whether they're offshore-roster staff — so the UI can filter
 * by department / work location. Service role, tenant-scoped (admin-gated page).
 */
export async function getSchedulerPool(): Promise<SchedulerEmployee[]> {
  const supa = createClient();
  const { data: tenant } = await supa.from("tenants").select("id").limit(1).maybeSingle();
  const admin = createAdminClient();
  if (!tenant || !admin) return [];
  const tid = tenant.id as string;

  const [{ data: profs }, { data: staff }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, department").eq("tenant_id", tid).eq("is_active", true).order("full_name"),
    admin.from("offshore_staff").select("profile_id").eq("tenant_id", tid),
  ]);
  const offshore = new Set((staff ?? []).map((s: Record<string, any>) => s.profile_id as string));

  return (profs ?? []).map((p: Record<string, any>) => ({
    id: p.id as string,
    name: (p.full_name as string | null) ?? (p.email as string | null) ?? "—",
    department: (p.department as string | null) ?? null,
    offshore: offshore.has(p.id as string),
  }));
}

const DAY_MS = 86_400_000;
const ACTIVE_SESSION_STATES = ["planned", "open", "in_progress"];
const ACTIVE_PARTICIPANT_STATES = ["enrolled", "attended", "passed"];

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

/**
 * Build training-scheduler candidates for the selected pool: each with their
 * crew rotation and the dates they're already busy — existing planned training
 * sessions and scheduled medical visits. Service role, tenant-scoped (the caller
 * is permission-gated in the action).
 */
export async function getTrainingCandidates(
  tenantId: string,
  profileIds: string[],
): Promise<TrainingCandidate[]> {
  const admin = createAdminClient();
  if (!admin || profileIds.length === 0) return [];

  const [{ data: profs }, { data: staff }, { data: parts }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email").in("id", profileIds),
    admin
      .from("offshore_staff")
      .select("profile_id, offshore_crews(cycle_start_date, offshore_days, onshore_days, is_active)")
      .eq("tenant_id", tenantId)
      .in("profile_id", profileIds),
    admin
      .from("training_participants")
      .select("profile_id, status, training_sessions!inner(starts_at, ends_at, status)")
      .in("profile_id", profileIds)
      .in("status", ACTIVE_PARTICIPANT_STATES),
  ]);

  const busy = new Map<string, Set<string>>();
  const addBusy = (pid: string, days: string[]) => {
    const set = busy.get(pid) ?? new Set<string>();
    for (const day of days) set.add(day);
    busy.set(pid, set);
  };

  for (const p of (parts ?? []) as Record<string, any>[]) {
    const s = Array.isArray(p.training_sessions) ? p.training_sessions[0] : p.training_sessions;
    if (!s || !ACTIVE_SESSION_STATES.includes(s.status)) continue;
    addBusy(p.profile_id, sessionDates(s.starts_at, s.ends_at));
  }

  // Scheduled medical visits also block the calendar (best-effort — the table
  // may not exist in every environment, so ignore any error).
  try {
    const { data: meds } = await admin
      .from("medical_schedules")
      .select("profile_id, visit1_date, visit2_date")
      .eq("tenant_id", tenantId)
      .in("profile_id", profileIds);
    for (const m of (meds ?? []) as Record<string, any>[]) {
      const days = [m.visit1_date, m.visit2_date].filter(Boolean) as string[];
      addBusy(m.profile_id, days);
    }
  } catch {
    /* medical_schedules not present — skip medical conflicts */
  }

  const staffById = new Map<string, Record<string, any>>();
  for (const s of (staff ?? []) as Record<string, any>[]) staffById.set(s.profile_id, s);

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
      busyDates: [...(busy.get(p.id) ?? [])],
    } satisfies TrainingCandidate;
  });
}
