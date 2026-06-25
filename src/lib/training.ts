import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const soon = new Date(ref + "T00:00:00Z");
  soon.setUTCDate(soon.getUTCDate() + EXPIRING_DAYS);
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
        .eq("profile_id", user.id)
        .eq("verified", true),
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
    .select("id, course_id, completed_on, expires_on, certificate_no, certificate_url, source, verified, course:training_courses(title)")
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
      source: r.source ?? "manual",
      verified: r.verified ?? true,
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
    .select("id, course_id, course_title, reason, preferred_period, origin, request_type, status, decision_note, created_at, course:training_courses(title)")
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
      origin: r.origin ?? null,
      request_type: r.request_type ?? null,
      status: r.status,
      decision_note: r.decision_note ?? null,
      created_at: r.created_at,
    };
  });
}

/** The signed-in manager's direct reports (lightweight, for request pickers). */
export async function getMyReportsLite(): Promise<{ id: string; name: string }[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("manager_id", user.id)
    .eq("is_active", true)
    .order("full_name");
  return ((data ?? []) as Record<string, any>[]).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string) || (p.email as string) || "—",
  }));
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

// --- Team Training (manager) ------------------------------------------------

export interface TeamReport {
  profile_id: string;
  name: string;
  department: string | null;
  items: import("@/types/training").MandatoryItem[];
}

/** The signed-in manager's direct reports with each one's mandatory compliance. */
export async function getTeamMandatory(): Promise<TeamReport[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const ref = today();

  const { data: reports } = await supabase
    .from("profiles")
    .select("id, full_name, department, job_title, employee_type")
    .eq("manager_id", user.id)
    .eq("is_active", true)
    .order("full_name");
  const reportList = (reports ?? []) as Record<string, any>[];
  if (reportList.length === 0) return [];
  const ids = reportList.map((r) => r.id as string);

  const [{ data: courses }, { data: reqs }, { data: records }] = await Promise.all([
    supabase.from("training_courses").select("id, title, is_statutory, validity_months").eq("is_active", true),
    supabase.from("training_requirements").select("course_id, applies_to, applies_value"),
    supabase.from("training_records").select("profile_id, course_id, completed_on, expires_on").eq("verified", true).in("profile_id", ids),
  ]);

  // latest record per (profile, course)
  const latest = new Map<string, { completed_on: string; expires_on: string | null }>();
  for (const r of (records ?? []) as Record<string, any>[]) {
    const k = `${r.profile_id}|${r.course_id}`;
    const prev = latest.get(k);
    if (!prev || r.completed_on > prev.completed_on) latest.set(k, { completed_on: r.completed_on, expires_on: r.expires_on ?? null });
  }
  const reqRows = (reqs ?? []) as Record<string, any>[];
  const courseRows = (courses ?? []) as Record<string, any>[];

  return reportList.map((p) => {
    const matches = (applies_to: string, value: string | null) =>
      applies_to === "all" ||
      (applies_to === "department" && !!value && value === p.department) ||
      (applies_to === "job_title" && !!value && value === p.job_title) ||
      (applies_to === "employee_type" && !!value && value === p.employee_type);
    const requiredIds = new Set<string>();
    for (const r of reqRows) if (matches(r.applies_to, r.applies_value ?? null)) requiredIds.add(r.course_id);

    const items = courseRows
      .filter((c) => c.is_statutory || requiredIds.has(c.id))
      .map((c) => {
        const rec = latest.get(`${p.id}|${c.id}`);
        let status: import("@/types/training").MandatoryItem["status"];
        if (!rec) status = "missing";
        else if (rec.expires_on && rec.expires_on < ref) status = "expired";
        else if (rec.expires_on && certStatus(rec.expires_on, ref) === "expiring") status = "expiring";
        else status = "compliant";
        return {
          course_id: c.id,
          title: c.title,
          is_statutory: c.is_statutory,
          validity_months: c.validity_months ?? null,
          completed_on: rec?.completed_on ?? null,
          expires_on: rec?.expires_on ?? null,
          status,
        };
      });
    return { profile_id: p.id, name: p.full_name ?? "—", department: p.department ?? null, items };
  });
}

export interface TeamRequestRow {
  id: string;
  profile_id: string;
  requester: string;
  course_title: string | null;
  reason: string | null;
  origin: import("@/types/training").RequestOrigin | null;
  request_type: import("@/types/training").RequestType | null;
  status: import("@/types/training").RequestStatus;
  created_at: string;
}

/** Training requests raised by the manager's direct reports. */
export async function getTeamRequests(): Promise<TeamRequestRow[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const { data: reports } = await supabase.from("profiles").select("id").eq("manager_id", user.id);
  const ids = ((reports ?? []) as Record<string, any>[]).map((r) => r.id as string);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("training_requests")
    .select("id, profile_id, course_title, reason, origin, request_type, status, created_at, course:training_courses(title), person:profiles!training_requests_profile_id_fkey(full_name)")
    .in("profile_id", ids)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    const person = Array.isArray(r.person) ? r.person[0] : r.person;
    return {
      id: r.id,
      profile_id: r.profile_id,
      requester: person?.full_name ?? "—",
      course_title: course?.title ?? r.course_title ?? null,
      reason: r.reason ?? null,
      origin: r.origin ?? null,
      request_type: r.request_type ?? null,
      status: r.status,
      created_at: r.created_at,
    };
  });
}

export interface AdminRequestRow {
  id: string;
  person: string;
  course_title: string | null;
  request_type: import("@/types/training").RequestType | null;
  origin: import("@/types/training").RequestOrigin | null;
  status: import("@/types/training").RequestStatus;
  created_at: string;
}

/** All training requests across the tenant (Training Admin console). */
export async function getRequestsAdmin(): Promise<AdminRequestRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("training_requests")
    .select("id, course_title, request_type, origin, status, created_at, course:training_courses(title), person:profiles!training_requests_profile_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    const person = Array.isArray(r.person) ? r.person[0] : r.person;
    return {
      id: r.id,
      person: person?.full_name ?? "—",
      course_title: course?.title ?? r.course_title ?? null,
      request_type: r.request_type ?? null,
      origin: r.origin ?? null,
      status: r.status,
      created_at: r.created_at,
    };
  });
}

export interface TeamPlanRow {
  id: string;
  member: string;
  course_title: string | null;
  plan_year: number;
  period: string | null;
  status: import("@/types/training").PlanStatus;
}

/** Training plan items for the manager's direct reports. */
export async function getTeamPlan(): Promise<TeamPlanRow[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const { data: reports } = await supabase.from("profiles").select("id").eq("manager_id", user.id);
  const ids = ((reports ?? []) as Record<string, any>[]).map((r) => r.id as string);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("training_plan_items")
    .select("id, plan_year, period, status, course_title, course:training_courses(title), person:profiles!training_plan_items_profile_id_fkey(full_name)")
    .in("profile_id", ids)
    .order("plan_year", { ascending: false });
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    const person = Array.isArray(r.person) ? r.person[0] : r.person;
    return {
      id: r.id,
      member: person?.full_name ?? "—",
      course_title: course?.title ?? r.course_title ?? null,
      plan_year: r.plan_year,
      period: r.period ?? null,
      status: r.status,
    };
  });
}

// --- Reports (Training Admin) -----------------------------------------------

export interface ComplianceReport {
  overall: { required: number; compliant: number; rate: number };
  byCourse: { title: string; required: number; compliant: number; expiring: number; expired: number; missing: number; rate: number }[];
}

/** Org-wide statutory compliance: required vs compliant across active staff. */
export async function getComplianceReport(): Promise<ComplianceReport> {
  const supabase = createClient();
  const ref = today();
  const [{ data: profiles }, { data: courses }, { data: reqs }, { data: records }] = await Promise.all([
    supabase.from("profiles").select("id, department, job_title, employee_type").eq("is_active", true),
    supabase.from("training_courses").select("id, title, is_statutory").eq("is_active", true),
    supabase.from("training_requirements").select("course_id, applies_to, applies_value"),
    supabase.from("training_records").select("profile_id, course_id, completed_on, expires_on").eq("verified", true),
  ]);
  const courseRows = (courses ?? []) as Record<string, any>[];
  const reqRows = (reqs ?? []) as Record<string, any>[];
  const latest = new Map<string, { completed_on: string; expires_on: string | null }>();
  for (const r of (records ?? []) as Record<string, any>[]) {
    const k = `${r.profile_id}|${r.course_id}`;
    const prev = latest.get(k);
    if (!prev || r.completed_on > prev.completed_on) latest.set(k, { completed_on: r.completed_on, expires_on: r.expires_on ?? null });
  }
  const per = new Map<string, { title: string; required: number; compliant: number; expiring: number; expired: number; missing: number }>();
  for (const c of courseRows) per.set(c.id, { title: c.title, required: 0, compliant: 0, expiring: 0, expired: 0, missing: 0 });

  for (const p of (profiles ?? []) as Record<string, any>[]) {
    const matches = (a: string, v: string | null) =>
      a === "all" ||
      (a === "department" && !!v && v === p.department) ||
      (a === "job_title" && !!v && v === p.job_title) ||
      (a === "employee_type" && !!v && v === p.employee_type);
    const requiredIds = new Set<string>();
    for (const r of reqRows) if (matches(r.applies_to, r.applies_value ?? null)) requiredIds.add(r.course_id);
    for (const c of courseRows) {
      if (!c.is_statutory && !requiredIds.has(c.id)) continue;
      const agg = per.get(c.id)!;
      agg.required += 1;
      const rec = latest.get(`${p.id}|${c.id}`);
      if (!rec) agg.missing += 1;
      else if (rec.expires_on && rec.expires_on < ref) agg.expired += 1;
      else {
        // A valid cert counts as compliant; flag the ones expiring soon.
        agg.compliant += 1;
        if (rec.expires_on && certStatus(rec.expires_on, ref) === "expiring") agg.expiring += 1;
      }
    }
  }
  const byCourse = [...per.values()]
    .filter((a) => a.required > 0)
    .map((a) => ({ ...a, rate: a.required ? Math.round((a.compliant / a.required) * 100) : 0 }))
    .sort((a, b) => a.rate - b.rate);
  const required = byCourse.reduce((s, a) => s + a.required, 0);
  const compliant = byCourse.reduce((s, a) => s + a.compliant, 0);
  return { overall: { required, compliant, rate: required ? Math.round((compliant / required) * 100) : 0 }, byCourse };
}

export interface ExpiringRow {
  id: string;
  person: string;
  course_title: string;
  expires_on: string;
  days: number;
  expired: boolean;
}

/** Certificates expiring within `days` (or already expired). */
export async function getExpiringReport(days = 90): Promise<ExpiringRow[]> {
  const supabase = createClient();
  const ref = today();
  const horizon = new Date(ref + "T00:00:00Z");
  horizon.setUTCDate(horizon.getUTCDate() + days);
  const horizonIso = horizon.toISOString().slice(0, 10);
  const { data } = await supabase
    .from("training_records")
    .select("id, expires_on, course:training_courses(title), person:profiles!training_records_profile_id_fkey(full_name)")
    .eq("verified", true)
    .not("expires_on", "is", null)
    .lte("expires_on", horizonIso)
    .order("expires_on", { ascending: true });
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    const person = Array.isArray(r.person) ? r.person[0] : r.person;
    const days = Math.round((new Date(r.expires_on + "T00:00:00Z").getTime() - new Date(ref + "T00:00:00Z").getTime()) / 86400000);
    return { id: r.id, person: person?.full_name ?? "—", course_title: course?.title ?? "—", expires_on: r.expires_on, days, expired: r.expires_on < ref };
  });
}

export interface CostReport {
  total: number;
  byCourse: { title: string; sessions: number; cost: number }[];
}

/** Training costs from scheduled sessions, by course. */
export async function getCostReport(): Promise<CostReport> {
  const supabase = createClient();
  const { data } = await supabase
    .from("training_sessions")
    .select("cost, status, course:training_courses(title)")
    .neq("status", "cancelled");
  const per = new Map<string, { sessions: number; cost: number }>();
  let total = 0;
  for (const s of (data ?? []) as Record<string, any>[]) {
    const course = Array.isArray(s.course) ? s.course[0] : s.course;
    const title = course?.title ?? "—";
    const cost = Number(s.cost) || 0;
    total += cost;
    const e = per.get(title) ?? { sessions: 0, cost: 0 };
    e.sessions += 1;
    e.cost += cost;
    per.set(title, e);
  }
  return {
    total,
    byCourse: [...per.entries()].map(([title, v]) => ({ title, ...v })).sort((a, b) => b.cost - a.cost),
  };
}

export interface PlanProgressReport {
  byStatus: { status: string; count: number }[];
  total: number;
}

/** Training plan progress: plan items grouped by status. */
export async function getPlanProgressReport(): Promise<PlanProgressReport> {
  const supabase = createClient();
  const { data } = await supabase.from("training_plan_items").select("status");
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as Record<string, any>[]) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const byStatus = [...counts.entries()].map(([status, count]) => ({ status, count }));
  return { byStatus, total: byStatus.reduce((s, r) => s + r.count, 0) };
}

export interface EffectivenessReport {
  byKind: { kind: string; avg: number | null; count: number }[];
  total: number;
}

/** Training effectiveness from evaluations (Kirkpatrick levels). */
export async function getEffectivenessReport(): Promise<EffectivenessReport> {
  const supabase = createClient();
  const { data } = await supabase.from("training_evaluations").select("kind, score");
  const agg = new Map<string, { sum: number; n: number; count: number }>();
  for (const r of (data ?? []) as Record<string, any>[]) {
    const e = agg.get(r.kind) ?? { sum: 0, n: 0, count: 0 };
    e.count += 1;
    if (r.score != null) {
      e.sum += Number(r.score);
      e.n += 1;
    }
    agg.set(r.kind, e);
  }
  const byKind = [...agg.entries()].map(([kind, v]) => ({ kind, avg: v.n ? Math.round((v.sum / v.n) * 10) / 10 : null, count: v.count }));
  return { byKind, total: byKind.reduce((s, r) => s + r.count, 0) };
}

// --- Department training needs ----------------------------------------------

/** Distinct departments across active staff (for the needs picker). */
export async function getDepartments(): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("department")
    .eq("is_active", true)
    .not("department", "is", null);
  const set = new Set<string>();
  for (const r of (data ?? []) as Record<string, any>[]) if (r.department) set.add(r.department as string);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export interface DeptNeedRow {
  title: string;
  needing: number;
  total: number;
}

/**
 * Outstanding mandatory training across a population — the whole organisation
 * (department null) or one department. A "need" is a required course (statutory
 * or matched by the matrix) that the person hasn't satisfied (missing / expired
 * / expiring). Used by the Training Admin's Department Training Needs view.
 */
export async function getDepartmentNeeds(
  department: string | null,
): Promise<{ needs: DeptNeedRow[]; population: number }> {
  const supabase = createClient();
  const ref = today();
  let pq = supabase
    .from("profiles")
    .select("id, department, job_title, employee_type")
    .eq("is_active", true);
  if (department) pq = pq.eq("department", department);

  const [{ data: profiles }, { data: courses }, { data: reqs }, { data: records }] = await Promise.all([
    pq,
    supabase.from("training_courses").select("id, title, is_statutory").eq("is_active", true),
    supabase.from("training_requirements").select("course_id, applies_to, applies_value"),
    supabase.from("training_records").select("profile_id, course_id, completed_on, expires_on").eq("verified", true),
  ]);
  const profileRows = (profiles ?? []) as Record<string, any>[];
  const courseRows = (courses ?? []) as Record<string, any>[];
  const reqRows = (reqs ?? []) as Record<string, any>[];

  const latest = new Map<string, { completed_on: string; expires_on: string | null }>();
  for (const r of (records ?? []) as Record<string, any>[]) {
    const k = `${r.profile_id}|${r.course_id}`;
    const prev = latest.get(k);
    if (!prev || r.completed_on > prev.completed_on) latest.set(k, { completed_on: r.completed_on, expires_on: r.expires_on ?? null });
  }

  const per = new Map<string, { needing: number; total: number }>();
  for (const p of profileRows) {
    const matches = (a: string, v: string | null) =>
      a === "all" ||
      (a === "department" && !!v && v === p.department) ||
      (a === "job_title" && !!v && v === p.job_title) ||
      (a === "employee_type" && !!v && v === p.employee_type);
    const requiredIds = new Set<string>();
    for (const r of reqRows) if (matches(r.applies_to, r.applies_value ?? null)) requiredIds.add(r.course_id);
    for (const c of courseRows) {
      if (!c.is_statutory && !requiredIds.has(c.id)) continue;
      const e = per.get(c.title) ?? { needing: 0, total: 0 };
      e.total += 1;
      const rec = latest.get(`${p.id}|${c.id}`);
      const ok = rec && !(rec.expires_on && rec.expires_on < ref) && !(rec.expires_on && certStatus(rec.expires_on, ref) === "expiring");
      if (!ok) e.needing += 1;
      per.set(c.title, e);
    }
  }
  const needs = [...per.entries()]
    .map(([title, v]) => ({ title, ...v }))
    .filter((r) => r.needing > 0)
    .sort((a, b) => b.needing - a.needing);
  return { needs, population: profileRows.length };
}

// --- HR: annual plan, budgets, evaluations ----------------------------------

export interface PlanRowAll {
  id: string;
  member: string;
  course_title: string | null;
  plan_year: number;
  period: string | null;
  status: import("@/types/training").PlanStatus;
  source: string;
}

/** Every training plan item (Training Admin view). */
export async function getPlanItemsAll(): Promise<PlanRowAll[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("training_plan_items")
    .select("id, plan_year, period, status, source, course_title, course:training_courses(title), person:profiles!training_plan_items_profile_id_fkey(full_name)")
    .order("plan_year", { ascending: false });
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    const person = Array.isArray(r.person) ? r.person[0] : r.person;
    return {
      id: r.id,
      member: person?.full_name ?? "—",
      course_title: course?.title ?? r.course_title ?? null,
      plan_year: r.plan_year,
      period: r.period ?? null,
      status: r.status,
      source: r.source,
    };
  });
}

export interface BudgetRow {
  id: string;
  budget_year: number;
  department: string | null;
  amount: number;
  currency: string;
}

export async function getBudgets(): Promise<BudgetRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("training_budgets")
    .select("id, budget_year, department, amount, currency")
    .order("budget_year", { ascending: false });
  return (data ?? []) as BudgetRow[];
}

export interface EvalRow {
  id: string;
  person: string;
  kind: string;
  score: number | null;
  comments: string | null;
  evaluated_on: string;
}

/** Evaluations recorded against a session. */
export async function getEvaluations(sessionId: string): Promise<EvalRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("training_evaluations")
    .select("id, kind, score, comments, evaluated_on, person:profiles!training_evaluations_profile_id_fkey(full_name)")
    .eq("session_id", sessionId)
    .order("evaluated_on", { ascending: false });
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const person = Array.isArray(r.person) ? r.person[0] : r.person;
    return {
      id: r.id,
      person: person?.full_name ?? "—",
      kind: r.kind,
      score: r.score ?? null,
      comments: r.comments ?? null,
      evaluated_on: r.evaluated_on,
    };
  });
}

// --- Competence -------------------------------------------------------------

export async function getCompetencies(): Promise<import("@/types/training").Competency[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("training_competencies")
    .select("id, code, name, category, description, max_level, is_active")
    .order("name");
  return (data ?? []) as import("@/types/training").Competency[];
}

export interface CompetencyLink {
  id: string;
  competency_id: string;
  course_id: string;
  course_title: string;
  target_level: number;
}

/** Course → competency links (which course develops which competency, to level). */
export async function getCompetencyLinks(): Promise<CompetencyLink[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("training_course_competencies")
    .select("id, competency_id, course_id, target_level, course:training_courses(title)");
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    return {
      id: r.id,
      competency_id: r.competency_id,
      course_id: r.course_id,
      course_title: course?.title ?? "—",
      target_level: r.target_level,
    };
  });
}

function overlayCompetencies(
  competencies: Record<string, any>[],
  levels: Record<string, any>[],
): import("@/types/training").EmployeeCompetency[] {
  const byComp = new Map<string, Record<string, any>>();
  for (const l of levels) byComp.set(l.competency_id, l);
  return competencies.map((c) => {
    const lvl = byComp.get(c.id);
    return {
      competency_id: c.id,
      name: c.name,
      category: c.category ?? null,
      max_level: c.max_level ?? 5,
      current_level: lvl?.current_level ?? 0,
      assessed_on: lvl?.assessed_on ?? null,
      self_level: lvl?.self_level ?? null,
      self_assessed_on: lvl?.self_assessed_on ?? null,
    };
  });
}

/** The signed-in user's competency levels (catalogue overlaid with their levels). */
export async function getMyCompetencies(): Promise<import("@/types/training").EmployeeCompetency[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const [{ data: comps }, { data: levels }] = await Promise.all([
    supabase.from("training_competencies").select("id, name, category, max_level").eq("is_active", true).order("name"),
    supabase.from("training_employee_competencies").select("competency_id, current_level, assessed_on, self_level, self_assessed_on").eq("profile_id", user.id),
  ]);
  return overlayCompetencies((comps ?? []) as Record<string, any>[], (levels ?? []) as Record<string, any>[]);
}

/** An employee's competency levels (for the HR matrix). */
export async function getEmployeeCompetencies(profileId: string): Promise<import("@/types/training").EmployeeCompetency[]> {
  const supabase = createClient();
  const [{ data: comps }, { data: levels }] = await Promise.all([
    supabase.from("training_competencies").select("id, name, category, max_level").eq("is_active", true).order("name"),
    supabase.from("training_employee_competencies").select("competency_id, current_level, assessed_on, self_level, self_assessed_on").eq("profile_id", profileId),
  ]);
  return overlayCompetencies((comps ?? []) as Record<string, any>[], (levels ?? []) as Record<string, any>[]);
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

// --- Reports: requests by origin --------------------------------------------

export interface OriginRow {
  origin: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

/** Training requests grouped by where they originate from (Reports). */
export async function getRequestsByOrigin(): Promise<{ rows: OriginRow[]; total: number }> {
  const supabase = createClient();
  const { data } = await supabase.from("training_requests").select("origin, status");
  const per = new Map<string, OriginRow>();
  for (const r of (data ?? []) as Record<string, any>[]) {
    const origin = (r.origin as string) || "unspecified";
    const e = per.get(origin) ?? { origin, total: 0, pending: 0, approved: 0, rejected: 0 };
    e.total += 1;
    if (r.status === "requested" || r.status === "manager_approved") e.pending += 1;
    else if (r.status === "approved") e.approved += 1;
    else if (r.status === "rejected") e.rejected += 1;
    per.set(origin, e);
  }
  const rows = [...per.values()].sort((a, b) => b.total - a.total);
  return { rows, total: rows.reduce((s, r) => s + r.total, 0) };
}

// --- Employee: competency gaps ----------------------------------------------

/**
 * Competencies where the employee sits below the level the catalogue is set up
 * to develop. The "target" is the highest target_level across the active courses
 * linked to that competency, so each gap comes with the courses that can close
 * it (feeding a one-click training request with origin `competency_gap`).
 */
export async function getMyCompetencyGaps(): Promise<import("@/types/training").CompetencyGap[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const [{ data: comps }, { data: levels }, { data: links }] = await Promise.all([
    supabase.from("training_competencies").select("id, name, category, max_level").eq("is_active", true),
    supabase.from("training_employee_competencies").select("competency_id, current_level").eq("profile_id", user.id),
    supabase
      .from("training_course_competencies")
      .select("competency_id, target_level, course:training_courses(id, title, is_active)"),
  ]);
  const cur = new Map<string, number>();
  for (const l of (levels ?? []) as Record<string, any>[]) cur.set(l.competency_id, (l.current_level as number) ?? 0);

  const targetByComp = new Map<string, number>();
  const coursesByComp = new Map<string, { id: string; title: string }[]>();
  for (const l of (links ?? []) as Record<string, any>[]) {
    const course = Array.isArray(l.course) ? l.course[0] : l.course;
    if (!course?.is_active) continue;
    const t = Math.max(targetByComp.get(l.competency_id) ?? 0, (l.target_level as number) ?? 1);
    targetByComp.set(l.competency_id, t);
    const arr = coursesByComp.get(l.competency_id) ?? [];
    if (!arr.some((c) => c.id === course.id)) arr.push({ id: course.id, title: course.title });
    coursesByComp.set(l.competency_id, arr);
  }

  const out: import("@/types/training").CompetencyGap[] = [];
  for (const c of (comps ?? []) as Record<string, any>[]) {
    const target = targetByComp.get(c.id);
    if (!target) continue; // no course develops it → can't define a gap
    const current = cur.get(c.id) ?? 0;
    if (current >= target) continue;
    out.push({
      competency_id: c.id,
      name: c.name,
      category: c.category ?? null,
      max_level: c.max_level ?? 5,
      current_level: current,
      target_level: target,
      gap: target - current,
      courses: coursesByComp.get(c.id) ?? [],
    });
  }
  return out.sort((a, b) => b.gap - a.gap || a.name.localeCompare(b.name));
}

// --- Employee: individual development plan (from appraisals) -----------------

/** The signed-in employee's IDP rows, with any linked training-request status. */
export async function getMyDevelopmentPlan(): Promise<import("@/types/training").DevelopmentPlanItem[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const { data: appraisals } = await supabase.from("appraisals").select("id").eq("employee_id", user.id);
  const appraisalIds = ((appraisals ?? []) as Record<string, any>[]).map((a) => a.id as string);
  if (appraisalIds.length === 0) return [];
  const [{ data: plans }, { data: reqs }] = await Promise.all([
    supabase
      .from("appraisal_development_plans")
      .select("id, area, action, target_date, status")
      .in("appraisal_id", appraisalIds)
      .order("created_at"),
    supabase
      .from("training_requests")
      .select("development_plan_id, status, created_at")
      .eq("profile_id", user.id)
      .not("development_plan_id", "is", null)
      .order("created_at", { ascending: true }),
  ]);
  // Most recent request per IDP row wins (handles re-requests after a rejection).
  const reqByPlan = new Map<string, string>();
  for (const r of (reqs ?? []) as Record<string, any>[]) reqByPlan.set(r.development_plan_id, r.status);
  return ((plans ?? []) as Record<string, any>[]).map((p) => ({
    id: p.id,
    area: p.area,
    action: p.action ?? null,
    target_date: p.target_date ?? null,
    status: p.status,
    request_status: (reqByPlan.get(p.id) as import("@/types/training").RequestStatus) ?? null,
  }));
}

// --- Employee: training history ---------------------------------------------

/** Everything the employee has completed (verified or self-reported). */
export async function getMyHistory(): Promise<import("@/types/training").HistoryItem[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const { data } = await supabase
    .from("training_records")
    .select("id, completed_on, expires_on, source, verified, certificate_no, certificate_url, course:training_courses(title)")
    .eq("profile_id", user.id)
    .order("completed_on", { ascending: false });
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    return {
      id: r.id,
      course_title: course?.title ?? "—",
      completed_on: r.completed_on,
      expires_on: r.expires_on ?? null,
      source: r.source ?? "manual",
      verified: r.verified ?? true,
      certificate_no: r.certificate_no ?? null,
      certificate_url: r.certificate_url ?? null,
    };
  });
}

// --- Employee: open sessions to self-enrol into -----------------------------

export async function getOpenSessions(): Promise<import("@/types/training").OpenSession[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const { data } = await supabase
    .from("training_sessions")
    .select(
      "id, location, starts_at, ends_at, capacity, course:training_courses(title)," +
        " trainer:training_trainers(full_name)",
    )
    .eq("status", "open")
    .order("starts_at", { ascending: true, nullsFirst: false });
  const sessions = (data ?? []) as Record<string, any>[];
  const ids = sessions.map((s) => s.id as string);
  const mine = new Map<string, { id: string; status: string }>();
  const enrolledBy = new Map<string, number>();
  if (ids.length) {
    // The caller can only read their own participant rows under RLS, so fetch
    // their enrolments with the user client …
    const { data: parts } = await supabase
      .from("training_participants")
      .select("id, session_id, status")
      .eq("profile_id", user.id)
      .in("session_id", ids);
    for (const p of (parts ?? []) as Record<string, any>[]) mine.set(p.session_id, { id: p.id, status: p.status });

    // … and the true seat counts (everyone's live enrolments) with the
    // service-role client, since RLS would otherwise hide other people's rows
    // and make every session look empty.
    const admin = createAdminClient();
    if (admin) {
      const { data: all } = await admin
        .from("training_participants")
        .select("session_id, status")
        .in("session_id", ids)
        .neq("status", "cancelled");
      for (const p of (all ?? []) as Record<string, any>[]) {
        enrolledBy.set(p.session_id, (enrolledBy.get(p.session_id) ?? 0) + 1);
      }
    }
  }
  return sessions.map((s) => {
    const course = Array.isArray(s.course) ? s.course[0] : s.course;
    const trainer = Array.isArray(s.trainer) ? s.trainer[0] : s.trainer;
    const m = mine.get(s.id);
    return {
      id: s.id,
      course_title: course?.title ?? "—",
      trainer_name: trainer?.full_name ?? null,
      location: s.location ?? null,
      starts_at: s.starts_at ?? null,
      ends_at: s.ends_at ?? null,
      capacity: s.capacity ?? null,
      enrolled: enrolledBy.get(s.id) ?? 0,
      my_participant_id: m?.id ?? null,
      my_status: (m?.status as import("@/types/training").ParticipantStatus) ?? null,
    };
  });
}

// --- Employee: sessions to evaluate -----------------------------------------

export async function getMyEvaluableSessions(): Promise<import("@/types/training").EvaluableSession[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];
  const [{ data: parts }, { data: evals }] = await Promise.all([
    supabase
      .from("training_participants")
      .select("status, session:training_sessions(id, ends_at, course:training_courses(title))")
      .eq("profile_id", user.id)
      .in("status", ["attended", "passed", "failed"]),
    supabase.from("training_evaluations").select("session_id").eq("profile_id", user.id),
  ]);
  const evaluated = new Set(((evals ?? []) as Record<string, any>[]).map((e) => e.session_id as string));
  const out: import("@/types/training").EvaluableSession[] = [];
  for (const p of (parts ?? []) as Record<string, any>[]) {
    const s = Array.isArray(p.session) ? p.session[0] : p.session;
    if (!s?.id) continue;
    const course = Array.isArray(s.course) ? s.course[0] : s.course;
    out.push({
      session_id: s.id,
      course_title: course?.title ?? "—",
      ended_on: s.ends_at ? (s.ends_at as string).slice(0, 10) : null,
      evaluated: evaluated.has(s.id),
    });
  }
  return out.sort((a, b) => (b.ended_on ?? "").localeCompare(a.ended_on ?? ""));
}

// --- Employee: dashboard overview -------------------------------------------

export interface TrainingDashboard {
  mandatoryOpen: number;
  mandatoryTotal: number;
  certsExpiring: number;
  certsTotal: number;
  pendingRequests: number;
  upcomingSessions: number;
  gaps: number;
  nextSession: import("@/types/training").UpcomingSession | null;
}

/** A compact overview for the employee's Training landing page. */
export async function getTrainingDashboard(): Promise<TrainingDashboard> {
  const [mandatory, certs, requests, upcoming, gaps] = await Promise.all([
    getMyMandatory(),
    getMyCertificates(),
    getMyRequests(),
    getMyUpcomingSessions(),
    getMyCompetencyGaps(),
  ]);
  return {
    mandatoryOpen: mandatory.filter((m) => m.status !== "compliant").length,
    mandatoryTotal: mandatory.length,
    certsExpiring: certs.filter((c) => c.status !== "valid").length,
    certsTotal: certs.length,
    pendingRequests: requests.filter((r) => r.status === "requested" || r.status === "manager_approved").length,
    upcomingSessions: upcoming.length,
    gaps: gaps.length,
    nextSession: upcoming[0] ?? null,
  };
}
