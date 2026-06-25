import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notify";

/**
 * Training & Competence notifications. Thin, best-effort wrappers over
 * `notifyUsers` that resolve the right recipients for each step of the request
 * / assignment / session lifecycle. Every function swallows its own errors so a
 * notification can never break the underlying action.
 */

/** Profile ids who administer training: tenant admins + `training:manage` holders. */
export async function trainingAdminIds(tenantId: string): Promise<string[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const ids = new Set<string>();
  const { data: admins } = await admin
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("role", ["tenant_admin", "super_admin"]);
  for (const r of admins ?? []) ids.add(r.id as string);

  const { data: roles } = await admin
    .from("tenant_roles")
    .select("id")
    .eq("tenant_id", tenantId)
    .contains("permissions", { training: ["manage"] });
  const roleIds = ((roles ?? []) as Record<string, any>[]).map((r) => r.id as string);
  if (roleIds.length) {
    const { data: pars } = await admin
      .from("profile_access_roles")
      .select("profile_id")
      .eq("tenant_id", tenantId)
      .in("role_id", roleIds);
    for (const r of pars ?? []) ids.add(r.profile_id as string);
  }
  return [...ids];
}

async function resolveCourseTitle(courseId?: string | null, courseTitle?: string | null): Promise<string> {
  if (courseTitle?.trim()) return courseTitle.trim();
  if (courseId) {
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin.from("training_courses").select("title").eq("id", courseId).maybeSingle();
      if (data?.title) return data.title as string;
    }
  }
  return "training";
}

/** An employee (or HR/gap/IDP flow) raised a request → tell their manager + HR. */
export async function notifyRequestRaised(opts: {
  tenantId: string;
  requesterId: string;
  courseId?: string | null;
  courseTitle?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: who } = await admin
      .from("profiles")
      .select("full_name, manager_id")
      .eq("id", opts.requesterId)
      .maybeSingle();
    const name = (who?.full_name as string) || "An employee";
    const course = await resolveCourseTitle(opts.courseId, opts.courseTitle);

    if (who?.manager_id) {
      await notifyUsers({
        tenantId: opts.tenantId,
        profileIds: [who.manager_id as string],
        category: "approval",
        title: "Training request to review",
        body: `${name} requested ${course}.`,
        url: "/training?view=team-requests",
      });
    }
    const admins = (await trainingAdminIds(opts.tenantId)).filter((id) => id !== who?.manager_id && id !== opts.requesterId);
    if (admins.length) {
      await notifyUsers({
        tenantId: opts.tenantId,
        profileIds: admins,
        category: "approval",
        title: "Training request raised",
        body: `${name} requested ${course}.`,
        url: "/training?view=assign",
      });
    }
  } catch (e) {
    console.error("notifyRequestRaised failed:", (e as Error).message);
  }
}

/** A manager / HR decided a request → tell the requester. */
export async function notifyRequestDecided(opts: {
  tenantId: string;
  profileId: string;
  courseId?: string | null;
  courseTitle?: string | null;
  decision: "approve" | "reject";
}): Promise<void> {
  try {
    const course = await resolveCourseTitle(opts.courseId, opts.courseTitle);
    const ok = opts.decision === "approve";
    await notifyUsers({
      tenantId: opts.tenantId,
      profileIds: [opts.profileId],
      category: "approval",
      title: ok ? "Training request approved" : "Training request declined",
      body: ok ? `Your request for ${course} was approved.` : `Your request for ${course} was declined.`,
      url: "/training?view=requests",
    });
  } catch (e) {
    console.error("notifyRequestDecided failed:", (e as Error).message);
  }
}

/** A manager raised a request for a report → tell the report + HR. */
export async function notifyManagerRequestForReport(opts: {
  tenantId: string;
  reportId: string;
  managerId: string;
  courseId?: string | null;
  courseTitle?: string | null;
}): Promise<void> {
  try {
    const course = await resolveCourseTitle(opts.courseId, opts.courseTitle);
    await notifyUsers({
      tenantId: opts.tenantId,
      profileIds: [opts.reportId],
      category: "general",
      title: "Your manager requested training for you",
      body: `${course} — pending HR approval.`,
      url: "/training?view=requests",
    });
    const admins = (await trainingAdminIds(opts.tenantId)).filter((id) => id !== opts.managerId);
    if (admins.length) {
      await notifyUsers({
        tenantId: opts.tenantId,
        profileIds: admins,
        category: "approval",
        title: "Training request raised",
        body: `A manager requested ${course} for a team member.`,
        url: "/training?view=assign",
      });
    }
  } catch (e) {
    console.error("notifyManagerRequestForReport failed:", (e as Error).message);
  }
}

/** HR assigned training to people (statutory / ad hoc) → tell each of them. */
export async function notifyTrainingAssigned(opts: {
  tenantId: string;
  profileIds: string[];
  courseId?: string | null;
  courseTitle?: string | null;
  mandatory: boolean;
}): Promise<void> {
  try {
    if (!opts.profileIds.length) return;
    const course = await resolveCourseTitle(opts.courseId, opts.courseTitle);
    await notifyUsers({
      tenantId: opts.tenantId,
      profileIds: opts.profileIds,
      category: opts.mandatory ? "approval" : "general",
      title: opts.mandatory ? "Mandatory training assigned" : "Training assigned",
      body: `${course} has been added to your training plan.`,
      url: "/training?view=my-plan",
    });
  } catch (e) {
    console.error("notifyTrainingAssigned failed:", (e as Error).message);
  }
}

/** Someone was enrolled in a session → tell the participant. */
export async function notifyEnrolled(opts: {
  tenantId: string;
  profileId: string;
  courseId?: string | null;
  courseTitle?: string | null;
  startsAt?: string | null;
}): Promise<void> {
  try {
    const course = await resolveCourseTitle(opts.courseId, opts.courseTitle);
    const when = opts.startsAt
      ? ` on ${new Date(opts.startsAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`
      : "";
    await notifyUsers({
      tenantId: opts.tenantId,
      profileIds: [opts.profileId],
      category: "general",
      title: "Enrolled in a training session",
      body: `You've been enrolled in ${course}${when}.`,
      url: "/training?view=calendar",
    });
  } catch (e) {
    console.error("notifyEnrolled failed:", (e as Error).message);
  }
}

/** A completion / certificate was recorded → tell the employee. */
export async function notifyCompletionRecorded(opts: {
  tenantId: string;
  profileId: string;
  courseId?: string | null;
  courseTitle?: string | null;
}): Promise<void> {
  try {
    const course = await resolveCourseTitle(opts.courseId, opts.courseTitle);
    await notifyUsers({
      tenantId: opts.tenantId,
      profileIds: [opts.profileId],
      category: "general",
      title: "Training certificate issued",
      body: `Your completion of ${course} has been recorded.`,
      url: "/training?view=certificates",
    });
  } catch (e) {
    console.error("notifyCompletionRecorded failed:", (e as Error).message);
  }
}
