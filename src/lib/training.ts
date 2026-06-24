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
    supabase.from("training_records").select("profile_id, course_id, completed_on, expires_on").in("profile_id", ids),
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
    .select("id, profile_id, course_title, reason, status, created_at, course:training_courses(title), person:profiles!training_requests_profile_id_fkey(full_name)")
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
  byCourse: { title: string; required: number; compliant: number; expired: number; missing: number; rate: number }[];
}

/** Org-wide statutory compliance: required vs compliant across active staff. */
export async function getComplianceReport(): Promise<ComplianceReport> {
  const supabase = createClient();
  const ref = today();
  const [{ data: profiles }, { data: courses }, { data: reqs }, { data: records }] = await Promise.all([
    supabase.from("profiles").select("id, department, job_title, employee_type").eq("is_active", true),
    supabase.from("training_courses").select("id, title, is_statutory").eq("is_active", true),
    supabase.from("training_requirements").select("course_id, applies_to, applies_value"),
    supabase.from("training_records").select("profile_id, course_id, completed_on, expires_on"),
  ]);
  const courseRows = (courses ?? []) as Record<string, any>[];
  const reqRows = (reqs ?? []) as Record<string, any>[];
  const latest = new Map<string, { completed_on: string; expires_on: string | null }>();
  for (const r of (records ?? []) as Record<string, any>[]) {
    const k = `${r.profile_id}|${r.course_id}`;
    const prev = latest.get(k);
    if (!prev || r.completed_on > prev.completed_on) latest.set(k, { completed_on: r.completed_on, expires_on: r.expires_on ?? null });
  }
  const per = new Map<string, { title: string; required: number; compliant: number; expired: number; missing: number }>();
  for (const c of courseRows) per.set(c.id, { title: c.title, required: 0, compliant: 0, expired: 0, missing: 0 });

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
      else agg.compliant += 1;
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
