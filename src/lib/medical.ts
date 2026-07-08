import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notify";
import { today } from "@/lib/canteen";
import type { MedicalRecord, MedicalSchedule } from "@/types/medical";
import { VISIT_LABEL, visitOnDate } from "@/types/medical";

const SELECT =
  "id, profile_id, fitness_status, exam_date, expiry_date, restrictions, notes, person_name, person_email";

const SCHED_SELECT =
  "id, profile_id, year, visit1_date, visit1_time, visit2_date, visit2_time, exam_indicators, work_location, visit1_completed_at, visit2_completed_at";

/** The current user's own latest medical record (confidential). */
export async function getMyMedical(): Promise<MedicalRecord | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("medical_current")
    .select(SELECT)
    .eq("profile_id", user.id)
    .maybeSingle();
  return (data as MedicalRecord) ?? null;
}

/** Roster of current records for all staff — medical officers only (RLS). */
export async function getMedicalRoster(): Promise<MedicalRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("medical_current")
    .select(SELECT)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) {
    console.error("getMedicalRoster:", error.message);
    return [];
  }
  return (data ?? []) as MedicalRecord[];
}

/** The current user's own upcoming medical schedule (latest year). RLS-scoped. */
export async function getMyMedicalSchedule(): Promise<MedicalSchedule | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("medical_schedules")
    .select(SCHED_SELECT)
    .eq("profile_id", user.id)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as MedicalSchedule) ?? null;
}

/** All schedules for the tenant, with employee names — admins only (RLS). */
export async function getMedicalScheduleRoster(): Promise<MedicalSchedule[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("medical_schedules")
    .select(`${SCHED_SELECT}, profiles(full_name)`)
    .order("visit1_date", { ascending: true });
  if (error) {
    console.error("getMedicalScheduleRoster:", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, unknown>) => {
    const prof = r.profiles as { full_name?: string | null } | null;
    return { ...(r as unknown as MedicalSchedule), person_name: prof?.full_name ?? null };
  });
}

export interface MedicalScheduleGroup {
  key: string;
  year: number;
  visit1_date: string;
  visit2_date: string | null;
  visit1_time: string | null;
  visit2_time: string | null;
  count: number;
}

/**
 * Lightweight summary of every schedule batch across all years (dates + count,
 * no member rows) — most recent first. Powers the collapsible history; member
 * details are pulled per batch on expand via getMedicalScheduleGroupMembers.
 */
export async function getMedicalScheduleGroups(): Promise<MedicalScheduleGroup[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("medical_schedules")
    .select("year, visit1_date, visit2_date, visit1_time, visit2_time")
    .order("visit1_date", { ascending: false });
  if (error) {
    console.error("getMedicalScheduleGroups:", error.message);
    return [];
  }
  const map = new Map<string, MedicalScheduleGroup>();
  for (const r of (data ?? []) as Record<string, any>[]) {
    const key = `${r.visit1_date}||${r.visit2_date ?? ""}`;
    const g =
      map.get(key) ??
      {
        key,
        year: r.year as number,
        visit1_date: r.visit1_date as string,
        visit2_date: (r.visit2_date as string | null) ?? null,
        visit1_time: (r.visit1_time as string | null) ?? null,
        visit2_time: (r.visit2_time as string | null) ?? null,
        count: 0,
      };
    g.count += 1;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => (a.visit1_date < b.visit1_date ? 1 : a.visit1_date > b.visit1_date ? -1 : 0));
}

/** Member rows for a single schedule batch (pulled on expand). RLS-scoped. */
export async function getMedicalScheduleGroupMembers(
  visit1: string,
  visit2: string | null,
): Promise<MedicalSchedule[]> {
  const supabase = createClient();
  let q = supabase
    .from("medical_schedules")
    .select(`${SCHED_SELECT}, profiles(full_name)`)
    .eq("visit1_date", visit1);
  q = visit2 ? q.eq("visit2_date", visit2) : q.is("visit2_date", null);
  const { data, error } = await q;
  if (error) {
    console.error("getMedicalScheduleGroupMembers:", error.message);
    return [];
  }
  return (data ?? [])
    .map((r: Record<string, unknown>) => {
      const prof = r.profiles as { full_name?: string | null } | null;
      return { ...(r as unknown as MedicalSchedule), person_name: prof?.full_name ?? null };
    })
    .sort((a, b) => (a.person_name ?? "").localeCompare(b.person_name ?? ""));
}

/** The visit (if any) the current user has *today*, for the dashboard reminder. */
export async function getMyMedicalVisitToday(): Promise<
  | { schedule: MedicalSchedule; which: 1 | 2; date: string; time: string | null }
  | null
> {
  const sched = await getMyMedicalSchedule();
  if (!sched) return null;
  const which = visitOnDate(sched, today());
  if (!which) return null;
  // Already marked done → no reminder needed.
  if (which === 1 && sched.visit1_completed_at) return null;
  if (which === 2 && sched.visit2_completed_at) return null;
  return {
    schedule: sched,
    which,
    date: which === 1 ? sched.visit1_date : (sched.visit2_date as string),
    time: which === 1 ? sched.visit1_time : sched.visit2_time,
  };
}

/**
 * If the current user has a medical visit today, ensure a one-off in-app/push
 * notification exists for it (deduped per visit-day). Best-effort; safe to call
 * on every dashboard load. Requires the service role (notify pipeline).
 */
export async function notifyMedicalVisitToday(): Promise<void> {
  const visit = await getMyMedicalVisitToday();
  if (!visit) return;
  const admin = createAdminClient();
  if (!admin) return;

  const { schedule, which, date, time } = visit;
  // Dedup: one medical reminder per person per day (notification URL carries the date).
  const url = `/medical?visit=${date}`;
  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("profile_id", schedule.profile_id)
    .eq("url", url)
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const { data: prof } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("id", schedule.profile_id)
    .maybeSingle();
  const tenantId = (prof as { tenant_id?: string } | null)?.tenant_id;
  if (!tenantId) return;

  await notifyUsers({
    tenantId,
    profileIds: [schedule.profile_id],
    category: "general",
    title: "Medical appointment today",
    body: `${VISIT_LABEL[which]}${time ? ` at ${time}` : ""}.${
      schedule.exam_indicators ? ` Exams: ${schedule.exam_indicators}` : ""
    }`,
    url,
  });
}
