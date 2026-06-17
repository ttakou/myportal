import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAccess } from "@/lib/auth";
import {
  getActiveCycle,
  getCalibration,
  getCompetencies,
  getCycleAppraisals,
  getCycles,
  getMyAppraisal,
  getTeamAppraisals,
} from "@/lib/appraisals";
import { MyAppraisalPanel } from "./_components/my-appraisal-panel";
import { TeamReviewPanel } from "./_components/team-review-panel";
import { HrConsole } from "./_components/hr-console";
import { CalibrationPanel } from "./_components/calibration-panel";

export default async function AppraisalsPage() {
  const access = await getAccess();
  const isHr = access.isHr || access.isAdmin || access.isSystemAdmin;
  const cycle = await getActiveCycle();

  const [cycles, myAppraisal, team, cycleAppraisals, competencies, calibration] =
    await Promise.all([
      isHr ? getCycles() : Promise.resolve([]),
      cycle ? getMyAppraisal(cycle.id) : Promise.resolve(null),
      cycle ? getTeamAppraisals(cycle.id) : Promise.resolve([]),
      isHr && cycle ? getCycleAppraisals(cycle.id) : Promise.resolve([]),
      isHr ? getCompetencies() : Promise.resolve([]),
      isHr && cycle ? getCalibration(cycle.id) : Promise.resolve(null),
    ]);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/performance"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Performance
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Performance appraisals</h1>
        <p className="text-muted-foreground">
          {cycle
            ? `${cycle.name} · ${cycle.status}`
            : "No active appraisal cycle yet."}
        </p>
      </div>

      {myAppraisal && <MyAppraisalPanel appraisal={myAppraisal} />}
      {team.length > 0 && <TeamReviewPanel appraisals={team} />}
      {isHr && (
        <HrConsole
          cycles={cycles}
          appraisals={cycleAppraisals}
          activeCycleId={cycle?.id ?? null}
          competencies={competencies}
        />
      )}
      {isHr && calibration && <CalibrationPanel data={calibration} />}

      {!cycle && !isHr && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No active appraisal cycle. You&apos;ll see your goals here once HR launches one.
        </p>
      )}
    </div>
  );
}
