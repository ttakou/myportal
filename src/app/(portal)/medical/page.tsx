import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { getMyMedical, getMedicalRoster } from "@/lib/medical";
import { getTenantUsers } from "@/lib/admin";
import { FITNESS_LABEL, daysToExpiry, type FitnessStatus } from "@/types/medical";
import { MedicalAdmin } from "./_components/medical-admin";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<FitnessStatus, string> = {
  fit: "bg-green-100 text-green-700",
  fit_with_restrictions: "bg-amber-100 text-amber-700",
  unfit: "bg-destructive/10 text-destructive",
  pending: "bg-muted text-muted-foreground",
};

export default async function MedicalPage() {
  const isAdmin = isAdminRole(await getCurrentRole());
  const [mine, roster, users] = await Promise.all([
    getMyMedical(),
    isAdmin ? getMedicalRoster() : Promise.resolve([]),
    isAdmin ? getTenantUsers() : Promise.resolve([]),
  ]);

  const d = daysToExpiry(mine?.expiry_date ?? null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fitness to Work &amp; Medical</h1>
        <p className="text-muted-foreground">Your confidential medical status.</p>
      </div>

      {/* Employee's own status */}
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

      {isAdmin && <MedicalAdmin roster={roster} users={users.map((u) => ({ id: u.id, name: u.full_name || u.email || "Unknown" }))} />}
    </div>
  );
}
