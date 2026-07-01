import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import {
  getMyMedical,
  getMedicalRoster,
  getMyMedicalSchedule,
  getMedicalScheduleRoster,
} from "@/lib/medical";
import { getTenantUsers } from "@/lib/admin";
import { FITNESS_LABEL, daysToExpiry, type FitnessStatus, type MedicalSchedule } from "@/types/medical";
import { MedicalAdmin } from "./_components/medical-admin";
import { resolveMedicalView } from "./_components/medical-views";
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

/** Read-only schedule roster for admins. */
function ScheduleRoster({ rows }: { rows: MedicalSchedule[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Medical schedule ({rows[0].year})</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">1st visit (exams)</th>
              <th className="px-3 py-2">2nd visit (screening)</th>
              <th className="px-3 py-2">Exams</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 font-medium">{r.person_name ?? "—"}</td>
                <td className="px-3 py-2">{r.work_location ?? "—"}</td>
                <td className="px-3 py-2">
                  <div>{fmtDate(r.visit1_date)}{r.visit1_time ? ` · ${r.visit1_time}` : ""}</div>
                  <div className="mt-1"><VisitCompleteButton scheduleId={r.id} visit={1} completedAt={r.visit1_completed_at} /></div>
                </td>
                <td className="px-3 py-2">
                  <div>{fmtDate(r.visit2_date)}{r.visit2_time ? ` · ${r.visit2_time}` : ""}</div>
                  <div className="mt-1"><VisitCompleteButton scheduleId={r.id} visit={2} completedAt={r.visit2_completed_at} /></div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.exam_indicators ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
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
  const [role, access] = await Promise.all([getCurrentRole(), getAccess()]);
  // Mirror the sidebar/console gate (isOrgAdmin) so the Administration nav item
  // and the page agree — the system_admin functional role counts as admin.
  const isAdmin = isAdminRole(role) || access.isSystemAdmin;
  const view = resolveMedicalView((await searchParams).view, isAdmin);
  const [mine, roster, users, mySchedule, scheduleRoster] = await Promise.all([
    getMyMedical(),
    isAdmin && view === "admin" ? getMedicalRoster() : Promise.resolve([]),
    isAdmin && view === "admin" ? getTenantUsers() : Promise.resolve([]),
    getMyMedicalSchedule(),
    isAdmin && view === "admin" ? getMedicalScheduleRoster() : Promise.resolve([]),
  ]);

  const d = daysToExpiry(mine?.expiry_date ?? null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fitness to Work &amp; Medical</h1>
        <p className="text-muted-foreground">
          {view === "admin" ? "Roster and record management." : "Your confidential medical status."}
        </p>
      </div>

      {view === "admin" ? (
        <>
          <MedicalAdmin roster={roster} users={users.map((u) => ({ id: u.id, name: u.full_name || u.email || "Unknown" }))} />
          <ScheduleRoster rows={scheduleRoster} />
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
