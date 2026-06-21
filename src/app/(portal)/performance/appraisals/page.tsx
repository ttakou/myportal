import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getPips } from "@/lib/pip";
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
  getMyAppraisalDelegate,
  getTeamAppraisals,
  getTenantColleagues,
} from "@/lib/appraisals";
import type { AppraisalCycle } from "@/types/appraisal";
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
import { PipPanel } from "./_components/pip-panel";

const COMPLETED_STATUSES = new Set(["completed", "closed"]);

function avgRating(ratings: (number | null)[]): string {
  const xs = ratings.filter((n): n is number => n != null);
  if (xs.length === 0) return "—";
  return (xs.reduce((s, n) => s + n, 0) / xs.length).toFixed(1);
}

/** Lightweight placeholder while a streamed section loads. */
function SectionSkeleton() {
  return <div className="h-24 animate-pulse rounded-lg border bg-muted/30" />;
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

  // Critical path — the primary content the user came for (own + team appraisals).
  // Secondary sections (history, rater inbox, HR console) stream in via Suspense.
  const [myAppraisal, team, secondLevel, pip] = await Promise.all([
    cycle ? getMyAppraisal(cycle.id) : Promise.resolve(null),
    cycle ? getTeamAppraisals(cycle.id) : Promise.resolve([]),
    cycle ? getSecondLevelQueue(cycle.id) : Promise.resolve([]),
    getPips(),
  ]);
  const isManagerView = team.length > 0;
  const [colleagues, deptObjectives, myDelegate] = await Promise.all([
    myAppraisal || isManagerView ? getTenantColleagues() : Promise.resolve([]),
    myAppraisal ? getDepartmentObjectivesForMe(cycle?.id ?? null) : Promise.resolve([]),
    isManagerView ? getMyAppraisalDelegate() : Promise.resolve(null),
  ]);
  // PIP employee picker: HR can pick anyone; a manager picks their reports.
  const pipEmployees = (
    isHr
      ? colleagues.map((c) => ({ id: c.id, name: c.full_name ?? "—" }))
      : team.map((a) => ({ id: a.employee_id, name: a.employee_name ?? "—" }))
  ).filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);

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

      {/* Line-manager view — your team's appraisals first (a manager's main task). */}
      {isManager && (
        <SummaryCards title={`Team dashboard — ${cycle?.year ?? ""}`} cards={teamCards} />
      )}
      {isManager && (
        <TeamReviewPanel appraisals={team} colleagues={colleagues} currentDelegate={myDelegate} />
      )}
      {secondLevel.length > 0 && <SecondLevelPanel appraisals={secondLevel} />}

      <PipPanel data={pip} employees={pipEmployees} />

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

      {/* Secondary — streamed so they never block the primary view above. */}
      <Suspense fallback={<SectionSkeleton />}>
        <HistorySection />
      </Suspense>

      <Suspense fallback={null}>
        <RaterSection />
      </Suspense>

      {/* HR-Admin dashboard — org-wide console + calibration for the selected year.
          Tucked behind a button so HR admins who are also managers see their team
          view first, and streamed so its heavy queries never block the page. */}
      {isHr && (
        <AdminToggle>
          <Suspense fallback={<SectionSkeleton />}>
            <HrSection cycle={cycle} allCycles={allCycles} />
          </Suspense>
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

/** Streamed: the viewer's past appraisals across cycles. */
async function HistorySection() {
  const myHistory = await getMyAppraisalHistory();
  return <AppraisalHistory history={myHistory} />;
}

/** Streamed: confidential witness/rater assignments awaiting the viewer. */
async function RaterSection() {
  const raterAssignments = await getMyRaterAssignments();
  if (raterAssignments.length === 0) return null;
  return <RaterInbox assignments={raterAssignments} />;
}

/** Streamed: org-wide HR console + calibration for the selected cycle. */
async function HrSection({
  cycle,
  allCycles,
}: {
  cycle: AppraisalCycle | null;
  allCycles: AppraisalCycle[];
}) {
  const [
    cycleAppraisals,
    competencies,
    calibration,
    calibrationRoster,
    calibrationAdjustments,
    departmentObjectives,
  ] = await Promise.all([
    cycle ? getCycleAppraisals(cycle.id) : Promise.resolve([]),
    getCompetencies(),
    cycle ? getCalibration(cycle.id) : Promise.resolve(null),
    cycle ? getCalibrationRoster(cycle.id) : Promise.resolve([]),
    cycle ? getCalibrationAdjustments(cycle.id) : Promise.resolve([]),
    getDepartmentObjectives(),
  ]);

  const hrCompleted = cycleAppraisals.filter((a) => COMPLETED_STATUSES.has(a.status)).length;
  const hrCards =
    cycle
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
    <>
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
    </>
  );
}
