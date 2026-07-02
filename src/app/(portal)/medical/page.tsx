import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import { getMyPermissions } from "@/lib/permissions-server";
import { hasPermission } from "@/lib/permissions";
import {
  getMyMedical,
  getMedicalRoster,
  getMyMedicalSchedule,
  getMedicalScheduleGroups,
  getMedicalScheduleGroupMembers,
} from "@/lib/medical";
import { getTenantUsers } from "@/lib/admin";
import { FITNESS_LABEL, daysToExpiry, type FitnessStatus, type MedicalSchedule } from "@/types/medical";
import { MedicalAdmin } from "./_components/medical-admin";
import { resolveMedicalView } from "./_components/medical-views";
import { CampaignPlanner } from "./_components/campaign-planner";
import { ScheduleRosterGroups } from "./_components/schedule-roster-groups";
import { VisitCompleteButton } from "./_components/visit-complete-button";
import { cn } from "@/lib/utils";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The employee's own upcoming schedule card. */
function MyScheduleCard({ s }: { s: MedicalSchedule }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <h2 className="font-semibold">Upcoming medical schedule ({s.year})</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <p className="text-xs uppercase text-muted-foreground">1st visit — medical exams</p>
          <p className="font-medium">{fmtDate(s.visit1_date)}</p>
          {s.visit1_time && <p className="text-sm text-muted-foreground">{s.visit1_time}</p>}
          <div className="mt-2">
            <VisitCompleteButton scheduleId={s.id} visit={1} completedAt={s.visit1_completed_at} />
          </div>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs uppercase text-muted-foreground">2nd visit — consultation & screening</p>
          <p className="font-medium">{fmtDate(s.visit2_date)}</p>
          {s.visit2_time && <p className="text-sm text-muted-foreground">{s.visit2_time}</p>}
          <div className="mt-2">
            <VisitCompleteButton scheduleId={s.id} visit={2} completedAt={s.visit2_completed_at} />
          </div>
        </div>
      </div>
      {s.exam_indicators && (
        <p className="mt-3 text-sm text-muted-foreground">Exams: {s.exam_indicators}</p>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<FitnessStatus, string> = {
  fit: "bg-green-100 text-green-700",
  fit_with_restrictions: "bg-amber-100 text-amber-700",
  unfit: "bg-destructive/10 text-destructive",
  pending: "bg-muted text-muted-foreground",
};

export default async function MedicalPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [role, access, perms] = await Promise.all([
    getCurrentRole(),
    getAccess(),
    getMyPermissions(),
  ]);
  // Admins, or a Medical Officer access role (medical:create) — the latter
  // manages records/schedules without full tenant-admin rights.
  const isAdmin =
    isAdminRole(role) || access.isSystemAdmin || hasPermission(perms, "medical", "create");
  const view = resolveMedicalView((await searchParams).view, isAdmin);
  const showRoster = isAdmin && view === "admin";
  const [mine, roster, users, mySchedule, scheduleGroups] = await Promise.all([
    getMyMedical(),
    showRoster ? getMedicalRoster() : Promise.resolve([]),
    isAdmin && (view === "admin" || view === "planner") ? getTenantUsers() : Promise.resolve([]),
    getMyMedicalSchedule(),
    showRoster ? getMedicalScheduleGroups() : Promise.resolve([]),
  ]);

  // Preload only the most recent batch's members; the rest load on expand.
  const topGroup = scheduleGroups[0] ?? null;
  const topMembers = topGroup
    ? await getMedicalScheduleGroupMembers(topGroup.visit1_date, topGroup.visit2_date)
    : [];

  const d = daysToExpiry(mine?.expiry_date ?? null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fitness to Work &amp; Medical</h1>
        <p className="text-muted-foreground">
          {view === "admin"
            ? "Roster and record management."
            : view === "planner"
              ? "Plan the annual medical campaign."
              : "Your confidential medical status."}
        </p>
      </div>

      {view === "planner" ? (
        <CampaignPlanner
          addableStaff={users
            .filter((u) => u.is_active)
            .map((u) => ({ id: u.id, name: u.full_name || u.email || "Unknown" }))}
        />
      ) : view === "admin" ? (
        <>
          <MedicalAdmin roster={roster} users={users.map((u) => ({ id: u.id, name: u.full_name || u.email || "Unknown" }))} />
          <ScheduleRosterGroups groups={scheduleGroups} initialKey={topGroup?.key ?? null} initialMembers={topMembers} />
        </>
      ) : (
        /* Employee's own status */
        <div className="space-y-6">
        {mySchedule && <MyScheduleCard s={mySchedule} />}
        <div className="rounded-lg border bg-card p-5">
          {mine ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={cn("rounded-full px-3 py-1 text-sm font-medium", STATUS_STYLE[mine.fitness_status])}>
                {FITNESS_LABEL[mine.fitness_status]}
              </span>
              {d != null && (
                <span className={cn("text-sm", d < 0 ? "text-destructive" : d <= 30 ? "text-amber-600" : "text-muted-foreground")}>
                  {d < 0 ? `Expired ${-d} day(s) ago` : `Valid for ${d} more day(s)`}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Exam {mine.exam_date}{mine.expiry_date ? ` · expires ${mine.expiry_date}` : ""}
            </p>
            {mine.restrictions && <p className="text-sm">Restrictions: {mine.restrictions}</p>}
          </div>
        ) : (
          <p className="text-muted-foreground">No medical record on file yet.</p>
        )}
        </div>
        </div>
      )}
    </div>
  );
}
