import { createClient } from "@/lib/supabase/server";
import { getAccess, getCachedUser } from "@/lib/auth";
import { getMyPermissions } from "@/lib/permissions-server";
import { hasPermission } from "@/lib/permissions";
import { today } from "@/lib/canteen";

/**
 * Whether the current user is a Training Admin — full module access and the
 * right to configure the catalogue, matrix and (later) who sees what. This is a
 * granular `training:manage` grant assigned via Access Roles, NOT the blanket HR
 * flag, so it can be given to a single HR training administrator rather than all
 * HR staff. Tenant/system admins always qualify.
 */
export async function isTrainingAdmin(): Promise<boolean> {
  const access = await getAccess();
  if (access.isSystemAdmin) return true;
  return hasPermission(await getMyPermissions(), "training", "manage");
}
import type {
  Certificate,
  MandatoryItem,
  PlanItem,
  TrainingCourse,
  TrainingRequest,
  UpcomingSession,
} from "@/types/training";

const EXPIRING_DAYS = 60;

function certStatus(expires: string | null, ref: string): Certificate["status"] {
  if (!expires) return "valid";
  if (expires < ref) return "expired";
  const soon = new Date(ref);
  soon.setDate(soon.getDate() + EXPIRING_DAYS);
  return expires <= soon.toISOString().slice(0, 10) ? "expiring" : "valid";
}

/** Courses the signed-in user must complete (statutory + matrix), with state. */
export async function getMyMandatory(): Promise<MandatoryItem[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const ref = today();

  const [{ data: profile }, { data: courses }, { data: reqs }, { data: records }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("department, job_title, employee_type")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("training_courses")
        .select("id, title, is_statutory, validity_months")
        .eq("is_active", true),
      supabase.from("training_requirements").select("course_id, applies_to, applies_value"),
      supabase
        .from("training_records")
        .select("course_id, completed_on, expires_on")
        .eq("profile_id", user.id),
    ]);

  const p = (profile ?? {}) as { department?: string; job_title?: string; employee_type?: string };
  const matches = (applies_to: string, value: string | null) => {
    if (applies_to === "all") return true;
    if (applies_to === "department") return !!value && value === p.department;
    if (applies_to === "job_title") return !!value && value === p.job_title;
    if (applies_to === "employee_type") return !!value && value === p.employee_type;
    return false;
  };

  // Latest record per course.
  const latest = new Map<string, { completed_on: string; expires_on: string | null }>();
  for (const r of (records ?? []) as Record<string, any>[]) {
    const prev = latest.get(r.course_id);
    if (!prev || r.completed_on > prev.completed_on) {
      latest.set(r.course_id, { completed_on: r.completed_on, expires_on: r.expires_on ?? null });
    }
  }

  const requiredIds = new Set<string>();
  for (const r of (reqs ?? []) as Record<string, any>[]) {
    if (matches(r.applies_to as string, (r.applies_value as string | null) ?? null)) {
      requiredIds.add(r.course_id as string);
    }
  }

  const out: MandatoryItem[] = [];
  for (const c of (courses ?? []) as Record<string, any>[]) {
    if (!c.is_statutory && !requiredIds.has(c.id)) continue;
    const rec = latest.get(c.id);
    let status: MandatoryItem["status"];
    if (!rec) status = "missing";
    else if (rec.expires_on && rec.expires_on < ref) status = "expired";
    else if (rec.expires_on && certStatus(rec.expires_on, ref) === "expiring") status = "expiring";
    else status = "compliant";
    out.push({
      course_id: c.id,
      title: c.title,
      is_statutory: c.is_statutory,
      validity_months: c.validity_months ?? null,
      completed_on: rec?.completed_on ?? null,
      expires_on: rec?.expires_on ?? null,
      status,
    });
  }
  return out.sort(
    (a, b) =>
      ["expired", "missing", "expiring", "compliant"].indexOf(a.status) -
        ["expired", "missing", "expiring", "compliant"].indexOf(b.status) ||
      a.title.localeCompare(b.title),
  );
}

/** The signed-in user's certificates / completion records. */
export async function getMyCertificates(): Promise<Certificate[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const ref = today();
  const { data } = await supabase
    .from("training_records")
    .select("id, course_id, completed_on, expires_on, certificate_no, certificate_url, course:training_courses(title)")
    .eq("profile_id", user.id)
    .order("completed_on", { ascending: false });
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    return {
      id: r.id,
      course_id: r.course_id,
      course_title: course?.title ?? "—",
      completed_on: r.completed_on,
      expires_on: r.expires_on ?? null,
      certificate_no: r.certificate_no ?? null,
      certificate_url: r.certificate_url ?? null,
      status: certStatus(r.expires_on ?? null, ref),
    };
  });
}

/** The signed-in user's training requests. */
export async function getMyRequests(): Promise<TrainingRequest[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const { data } = await supabase
    .from("training_requests")
    .select("id, course_id, course_title, reason, preferred_period, status, decision_note, created_at, course:training_courses(title)")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    return {
      id: r.id,
      course_id: r.course_id ?? null,
      course_title: course?.title ?? r.course_title ?? null,
      reason: r.reason ?? null,
      preferred_period: r.preferred_period ?? null,
      status: r.status,
      decision_note: r.decision_note ?? null,
      created_at: r.created_at,
    };
  });
}

/** The signed-in user's training plan items. */
export async function getMyPlan(): Promise<PlanItem[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const { data } = await supabase
    .from("training_plan_items")
    .select("id, course_id, course_title, plan_year, period, status, source, course:training_courses(title)")
    .eq("profile_id", user.id)
    .order("plan_year", { ascending: false });
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    return {
      id: r.id,
      course_id: r.course_id ?? null,
      course_title: course?.title ?? r.course_title ?? null,
      plan_year: r.plan_year,
      period: r.period ?? null,
      status: r.status,
      source: r.source,
    };
  });
}

/** Upcoming sessions the user is enrolled in (training calendar). */
export async function getMyUpcomingSessions(): Promise<UpcomingSession[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const { data } = await supabase
    .from("training_participants")
    .select(
      "id, status, session:training_sessions(id, starts_at, ends_at, location, course:training_courses(title))",
    )
    .eq("profile_id", user.id)
    .in("status", ["enrolled", "attended"])
    .order("created_at", { ascending: false });
  return ((data ?? []) as Record<string, any>[])
    .map((r) => {
      const s = Array.isArray(r.session) ? r.session[0] : r.session;
      const course = s ? (Array.isArray(s.course) ? s.course[0] : s.course) : null;
      return {
        participant_id: r.id,
        session_id: s?.id ?? "",
        course_title: course?.title ?? "—",
        starts_at: s?.starts_at ?? null,
        ends_at: s?.ends_at ?? null,
        location: s?.location ?? null,
        status: r.status,
      } as UpcomingSession;
    })
    .filter((s) => s.session_id)
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
}

// --- HR / catalogue ---------------------------------------------------------

/** Active courses in the catalogue (tenant-readable). */
export async function getCourses(): Promise<TrainingCourse[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("training_courses")
    .select(
      "id, code, title, description, category, delivery, provider_id, is_statutory, validity_months, duration_hours, cost, currency, is_active",
    )
    .order("title", { ascending: true });
  return (data ?? []) as TrainingCourse[];
}

export interface RequirementRow {
  id: string;
  course_id: string;
  course_title: string;
  applies_to: string;
  applies_value: string | null;
  recurrence_months: number | null;
}

/** The statutory training matrix rows (who must do what). */
export async function getRequirements(): Promise<RequirementRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("training_requirements")
    .select("id, course_id, applies_to, applies_value, recurrence_months, course:training_courses(title)")
    .order("created_at", { ascending: false });
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    return {
      id: r.id,
      course_id: r.course_id,
      course_title: course?.title ?? "—",
      applies_to: r.applies_to,
      applies_value: r.applies_value ?? null,
      recurrence_months: r.recurrence_months ?? null,
    };
  });
}

export async function getProviders(): Promise<import("@/types/training").Provider[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("training_providers")
    .select("id, name, contact_name, email, phone, is_active")
    .order("name");
  return (data ?? []) as import("@/types/training").Provider[];
}

export async function getTrainers(): Promise<import("@/types/training").Trainer[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("training_trainers")
    .select("id, full_name, email, expertise, provider_id, is_internal, is_active")
    .order("full_name");
  return (data ?? []) as import("@/types/training").Trainer[];
}

/** Sessions with course title, trainer name and live enrolment count. */
export async function getSessions(): Promise<import("@/types/training").Session[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("training_sessions")
    .select(
      "id, course_id, trainer_id, location, starts_at, ends_at, capacity, status," +
        " course:training_courses(title), trainer:training_trainers(full_name)," +
        " training_participants(count)",
    )
    .order("starts_at", { ascending: false, nullsFirst: false });
  return ((data ?? []) as Record<string, any>[]).map((s) => {
    const course = Array.isArray(s.course) ? s.course[0] : s.course;
    const trainer = Array.isArray(s.trainer) ? s.trainer[0] : s.trainer;
    return {
      id: s.id,
      course_id: s.course_id,
      course_title: course?.title ?? "—",
      trainer_id: s.trainer_id ?? null,
      trainer_name: trainer?.full_name ?? null,
      location: s.location ?? null,
      starts_at: s.starts_at ?? null,
      ends_at: s.ends_at ?? null,
      capacity: s.capacity ?? null,
      status: s.status,
      enrolled: s.training_participants?.[0]?.count ?? 0,
    };
  });
}

/** Participants of a session, with whether a completion record already exists. */
export async function getParticipants(
  sessionId: string,
): Promise<import("@/types/training").Participant[]> {
  const supabase = createClient();
  const { data: parts } = await supabase
    .from("training_participants")
    .select("id, profile_id, status, score, completed_at, person:profiles!training_participants_profile_id_fkey(full_name)")
    .eq("session_id", sessionId);
  const { data: recs } = await supabase
    .from("training_records")
    .select("profile_id")
    .eq("session_id", sessionId);
  const recorded = new Set((recs ?? []).map((r) => r.profile_id as string));
  return ((parts ?? []) as Record<string, any>[])
    .map((p) => {
      const person = Array.isArray(p.person) ? p.person[0] : p.person;
      return {
        id: p.id,
        profile_id: p.profile_id,
        full_name: person?.full_name ?? "—",
        status: p.status,
        score: p.score ?? null,
        completed_at: p.completed_at ?? null,
        recorded: recorded.has(p.profile_id),
      } as import("@/types/training").Participant;
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/** Active employees for enrolment pickers. */
export async function getEmployeesLite(): Promise<{ id: string; name: string }[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("is_active", true)
    .order("full_name");
  return ((data ?? []) as Record<string, any>[]).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string) || (p.email as string) || "—",
  }));
}
