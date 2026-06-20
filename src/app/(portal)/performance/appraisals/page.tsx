import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAccess } from "@/lib/auth";
import {
  getCalibration,
  getCalibrationAdjustments,
  getCalibrationRoster,
  getCompetencies,
  getCycleAppraisals,
  getCycles,
  getDepartmentObjectives,
  getDepartmentObjectivesForMe,
  getMyAppraisal,
  getMyAppraisalHistory,
  getMyRaterAssignments,
  getSecondLevelQueue,
  getTeamAppraisals,
  getTenantColleagues,
} from "@/lib/appraisals";
import { MyAppraisalPanel } from "./_components/my-appraisal-panel";
import { TeamReviewPanel } from "./_components/team-review-panel";
import { HrConsole } from "./_components/hr-console";
import { CalibrationPanel } from "./_components/calibration-panel";
import { SecondLevelPanel } from "./_components/second-level-panel";
import { RaterInbox } from "./_components/rater-inbox";
import { CycleSwitcher } from "./_components/cycle-switcher";
import { SummaryCards } from "./_components/summary-cards";
import { AppraisalHistory } from "./_components/appraisal-history";
import { AdminToggle } from "./_components/admin-toggle";

const COMPLETED_STATUSES = new Set(["completed", "closed"]);

function avgRating(ratings: (number | null)[]): string {
  const xs = ratings.filter((n): n is number => n != null);
  if (xs.length === 0) return "—";
  return (xs.reduce((s, n) => s + n, 0) / xs.length).toFixed(1);
}

export default async function AppraisalsPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const access = await getAccess();
  const isHr = access.isHr || access.isAdmin || access.isSystemAdmin;

  // Every cycle (year) the tenant has run, newest first — powers the year switcher.
  const allCycles = await getCycles();
  // Employees navigate real (active/closed) years only; HR can also see drafts.
  const visibleCycles = isHr ? allCycles : allCycles.filter((c) => c.status !== "draft");
  const activeCycle =
    visibleCycles.find((c) => c.status === "active") ?? visibleCycles[0] ?? null;

  // Default to the current cycle; `?cycle=` lets the user jump to a past year.
  const { cycle: requestedId } = await searchParams;
  const cycle =
    (requestedId ? visibleCycles.find((c) => c.id === requestedId) : null) ?? activeCycle;
  const isCurrent = !!cycle && cycle.status === "active";

  const [
    myAppraisal,
    team,
    cycleAppraisals,
    competencies,
    calibration,
    secondLevel,
    raterAssignments,
    calibrationRoster,
    calibrationAdjustments,
    departmentObjectives,
  ] = await Promise.all([
    cycle ? getMyAppraisal(cycle.id) : Promise.resolve(null),
    cycle ? getTeamAppraisals(cycle.id) : Promise.resolve([]),
    isHr && cycle ? getCycleAppraisals(cycle.id) : Promise.resolve([]),
    isHr ? getCompetencies() : Promise.resolve([]),
    isHr && cycle ? getCalibration(cycle.id) : Promise.resolve(null),
    cycle ? getSecondLevelQueue(cycle.id) : Promise.resolve([]),
    getMyRaterAssignments(),
    isHr && cycle ? getCalibrationRoster(cycle.id) : Promise.resolve([]),
    isHr && cycle ? getCalibrationAdjustments(cycle.id) : Promise.resolve([]),
    isHr ? getDepartmentObjectives() : Promise.resolve([]),
  ]);
  const myHistory = await getMyAppraisalHistory();
  const [colleagues, deptObjectives] = await Promise.all([
    myAppraisal ? getTenantColleagues() : Promise.resolve([]),
    myAppraisal ? getDepartmentObjectivesForMe(cycle?.id ?? null) : Promise.resolve([]),
  ]);

  const isManager = team.length > 0;

  // Line-manager dashboard metrics for the selected year.
  const teamCards = isManager
    ? [
        { label: "Direct reports", value: String(team.length) },
        {
          label: "Awaiting your review",
          value: String(team.filter((a) => a.status === "pending_manager_review").length),
        },
        {
          label: "Completed",
          value: String(team.filter((a) => COMPLETED_STATUSES.has(a.status)).length),
        },
        { label: "Avg rating", value: avgRating(team.map((a) => a.overall_rating)), hint: "out of 5" },
      ]
    : [];

  // HR-Admin dashboard metrics for the selected year.
  const hrCompleted = cycleAppraisals.filter((a) => COMPLETED_STATUSES.has(a.status)).length;
  const hrCards =
    isHr && cycle
      ? [
          { label: "Employees", value: String(cycleAppraisals.length) },
          { label: "Completed", value: String(hrCompleted) },
          {
            label: "Completion",
            value: cycleAppraisals.length
              ? `${Math.round((hrCompleted / cycleAppraisals.length) * 100)}%`
              : "—",
          },
          {
            label: "Avg rating",
            value: calibration?.averageOverall != null ? calibration.averageOverall.toFixed(1) : "—",
            hint: "out of 5",
          },
        ]
      : [];

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
          {cycle ? `${cycle.name} · ${cycle.status}` : "No active appraisal cycle yet."}
        </p>
      </div>

      <CycleSwitcher cycles={visibleCycles} selectedId={cycle?.id ?? null} />

      {cycle && !isCurrent && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You&apos;re viewing the {cycle.year} appraisal cycle ({cycle.status}). Historical cycles are read-only.
        </p>
      )}

      {/* Employee view — your own appraisal for the selected year. */}
      {myAppraisal ? (
        <div className="space-y-3">
          <MyAppraisalPanel
            appraisal={myAppraisal}
            colleagues={colleagues}
            deptObjectives={deptObjectives}
          />
          {COMPLETED_STATUSES.has(myAppraisal.status) && (
            <Link
              href={`/performance/appraisals/${myAppraisal.id}/outcome`}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              View / print outcome
            </Link>
          )}
        </div>
      ) : (
        cycle &&
        !isHr && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No appraisal recorded for you in {cycle.year}.
          </p>
        )
      )}

      <AppraisalHistory history={myHistory} />

      {raterAssignments.length > 0 && <RaterInbox assignments={raterAssignments} />}

      {/* Line-manager dashboard — direct reports for the selected year. */}
      {isManager && (
        <SummaryCards title={`Team dashboard — ${cycle?.year ?? ""}`} cards={teamCards} />
      )}
      {isManager && <TeamReviewPanel appraisals={team} />}
      {secondLevel.length > 0 && <SecondLevelPanel appraisals={secondLevel} />}

      {/* HR-Admin dashboard — org-wide console + calibration for the selected year.
          Tucked behind a button so HR admins who are also managers see their team
          view first and open the admin tools on demand. */}
      {isHr && (
        <AdminToggle>
          {cycle && cycleAppraisals.length > 0 && (
            <SummaryCards title={`HR dashboard — ${cycle.year}`} cards={hrCards} />
          )}
          <HrConsole
            cycles={allCycles}
            appraisals={cycleAppraisals}
            activeCycleId={cycle?.id ?? null}
            cycleName={cycle?.name ?? null}
            competencies={competencies}
            departmentObjectives={departmentObjectives}
          />
          {calibration && (
            <CalibrationPanel
              data={calibration}
              roster={calibrationRoster}
              adjustments={calibrationAdjustments}
            />
          )}
        </AdminToggle>
      )}

      {!cycle && !isHr && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No active appraisal cycle. You&apos;ll see your goals here once HR launches one.
        </p>
      )}
    </div>
  );
}
