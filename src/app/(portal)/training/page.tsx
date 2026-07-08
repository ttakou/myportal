import { GraduationCap } from "lucide-react";
import { hasDirectReports } from "@/lib/appraisals";
import {
  getCourses,
  getCourseHistory,
  getExecutiveSummary,
  getGlobalTrainingMatrix,
  getPeriodTrainingStats,
  getEmployeesLite,
  getMyCertificates,
  getMyMandatory,
  getMyPlan,
  getMyRequests,
  getMyUpcomingSessions,
  getBudgets,
  getCompetencies,
  getCompetencyLinks,
  getCompetencyRoster,
  getDepartmentNeeds,
  getDepartments,
  getEmployeeCompetencies,
  getEvaluations,
  getMyCompetencies,
  getMyCompetencyGaps,
  getMyDevelopmentPlan,
  getMyEvaluableSessions,
  getMyHistory,
  getOpenSessions,
  getMyReportsLite,
  getParticipants,
  getPlanItemsAll,
  getProviders,
  getRequestsAdmin,
  getRequestsByOrigin,
  getRequirements,
  getSessions,
  getTeamMandatory,
  getTeamPlan,
  getTeamRequests,
  getTrainers,
  getComplianceReport,
  getCostReport,
  getEffectivenessReport,
  getExpiringReport,
  getPlanProgressReport,
  getTrainingDashboard,
  isTrainingAdmin,
} from "@/lib/training";
import {
  IMPLEMENTED_VIEWS,
  TRAINING_VIEWS,
  canSeeTrainingView,
  hubForView,
  resolveTrainingView,
  type TrainingAccess,
} from "./_components/training-views";
import { ViewTabs } from "./_components/view-tabs";
import {
  CalendarPanel,
  DashboardPanel,
  DeptNeedsPanel,
  HistoryPanel,
  MandatoryPanel,
  NoAccessPanel,
  PlanPanel,
  PlannedPanel,
  TeamCompliancePanel,
  TeamPlanPanel,
} from "./_components/read-panels";
import { AssignPanel } from "./_components/assign-panel";
import { TrainingScheduler } from "./_components/training-scheduler";
import { getSchedulerPool } from "@/lib/training-planner-data";
import { RecordTrainingPanel } from "./_components/record-training-panel";
import { CompetenciesPanel } from "./_components/competencies-panel";
import { CompetencyMatrixPanel } from "./_components/competency-matrix-panel";
import { CompetencyHoldersPanel } from "./_components/competency-holders-panel";
import { DepartmentNeedsPanel } from "./_components/department-needs-panel";
import { TeamRequestsPanel } from "./_components/team-requests-panel";
import {
  ComplianceReportPanel,
  CostReportPanel,
  EffectivenessReportPanel,
  ExpiringReportPanel,
  PlanProgressReportPanel,
  RequestsByOriginReportPanel,
} from "./_components/report-panels";
import { CertificatesPanel } from "./_components/certificates-panel";
import { SelfCompetenciesPanel } from "./_components/self-competencies-panel";
import { IdpPanel } from "./_components/idp-panel";
import { GapsPanel } from "./_components/gaps-panel";
import { BrowseCataloguePanel } from "./_components/browse-catalogue-panel";
import { OpenSessionsPanel } from "./_components/open-sessions-panel";
import { MyEvaluationsPanel } from "./_components/my-evaluations-panel";
import { AnnualPlanPanel } from "./_components/annual-plan-panel";
import { BudgetsPanel } from "./_components/budgets-panel";
import { EvaluationsPanel } from "./_components/evaluations-panel";
import { RequestPanel } from "./_components/request-panel";
import { CataloguePanel } from "./_components/catalogue-panel";
import { MatrixPanel } from "./_components/matrix-panel";
import { ProvidersPanel } from "./_components/providers-panel";
import { TrainersPanel } from "./_components/trainers-panel";
import { SessionsPanel } from "./_components/sessions-panel";
import { CourseHistoryPanel } from "./_components/course-history-panel";
import { ExecSummaryPanel } from "./_components/exec-summary-panel";
import { PeriodReportPanel } from "./_components/period-report-panel";
import { ComparativeReportPanel } from "./_components/comparative-report-panel";
import { GlobalMatrixPanel } from "./_components/global-matrix-panel";
import { ParticipantsPanel } from "./_components/participants-panel";

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; session?: string; person?: string; dept?: string; competency?: string; course?: string; year?: string; from?: string; to?: string; fromB?: string; toB?: string }>;
}) {
  const { view, session, person, dept, competency, course, year, from, to, fromB, toB } = await searchParams;
  const key = resolveTrainingView(view);
  const [admin, manager] = await Promise.all([isTrainingAdmin(), hasDirectReports()]);
  const access: TrainingAccess = { isManager: manager, isTrainingAdmin: admin };
  const meta = TRAINING_VIEWS.find((v) => v.key === key);
  // Consolidated navigation: the hub this view lives in (if any) renders its
  // sibling views as a tab bar; access to every tab matches the hub's group.
  const hub = canSeeTrainingView(key, access) ? hubForView(key) : null;

  async function body() {
    if (!canSeeTrainingView(key, access)) return <NoAccessPanel />;
    if (!IMPLEMENTED_VIEWS.has(key)) return <PlannedPanel label={meta?.label ?? "This view"} />;

    switch (key) {
      case "dashboard":
        return <DashboardPanel data={await getTrainingDashboard()} />;
      case "mandatory":
        return <MandatoryPanel items={await getMyMandatory()} />;
      case "certificates": {
        const [items, courses] = await Promise.all([getMyCertificates(), getCourses()]);
        return (
          <CertificatesPanel
            items={items}
            courses={courses.filter((c) => c.is_active).map((c) => ({ id: c.id, title: c.title }))}
          />
        );
      }
      case "history":
        return <HistoryPanel items={await getMyHistory()} />;
      case "gaps":
        return <GapsPanel gaps={await getMyCompetencyGaps()} />;
      case "idp": {
        const [items, courses] = await Promise.all([getMyDevelopmentPlan(), getCourses()]);
        return (
          <IdpPanel
            items={items}
            courses={courses.filter((c) => c.is_active).map((c) => ({ id: c.id, title: c.title }))}
          />
        );
      }
      case "browse":
        return <BrowseCataloguePanel courses={await getCourses()} />;
      case "open-sessions":
        return <OpenSessionsPanel sessions={await getOpenSessions()} />;
      case "my-evaluations":
        return <MyEvaluationsPanel sessions={await getMyEvaluableSessions()} />;
      case "my-plan":
        return <PlanPanel items={await getMyPlan()} />;
      case "calendar":
        return <CalendarPanel items={await getMyUpcomingSessions()} />;
      case "requests": {
        const [requests, courses] = await Promise.all([getMyRequests(), getCourses()]);
        return (
          <RequestPanel
            requests={requests}
            courses={courses.filter((c) => c.is_active).map((c) => ({ id: c.id, title: c.title }))}
          />
        );
      }
      case "catalogue":
        return <CataloguePanel courses={await getCourses()} />;
      case "matrix": {
        const [requirements, courses, competencies] = await Promise.all([
          getRequirements(),
          getCourses(),
          getCompetencies(),
        ]);
        return (
          <MatrixPanel
            requirements={requirements}
            courses={courses.filter((c) => c.is_active).map((c) => ({ id: c.id, title: c.title }))}
            competencies={competencies.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name }))}
          />
        );
      }
      case "record-training": {
        const [employees, courses] = await Promise.all([getEmployeesLite(), getCourses()]);
        return (
          <RecordTrainingPanel
            employees={employees}
            courses={courses
              .filter((c) => c.is_active)
              .map((c) => ({ id: c.id, title: c.title, validity_months: c.validity_months }))}
          />
        );
      }
      case "team-compliance":
        return <TeamCompliancePanel reports={await getTeamMandatory()} />;
      case "dept-needs": {
        // Training Admins get a department-/org-wide view (they usually have no
        // direct reports); a pure line manager sees their own team.
        if (access.isTrainingAdmin) {
          const departments = await getDepartments();
          const selectedDept = dept && departments.includes(dept) ? dept : null;
          const { needs, population } = await getDepartmentNeeds(selectedDept);
          return <DepartmentNeedsPanel departments={departments} selected={selectedDept} needs={needs} population={population} />;
        }
        return <DeptNeedsPanel reports={await getTeamMandatory()} />;
      }
      case "team-plan":
        return <TeamPlanPanel rows={await getTeamPlan()} />;
      case "team-requests": {
        const [trReqs, reports, courses] = await Promise.all([getTeamRequests(), getMyReportsLite(), getCourses()]);
        return (
          <TeamRequestsPanel
            requests={trReqs}
            reports={reports}
            courses={courses.filter((c) => c.is_active).map((c) => ({ id: c.id, title: c.title }))}
          />
        );
      }
      case "assign": {
        const [adminReqs, courses, employees, departments] = await Promise.all([
          getRequestsAdmin(),
          getCourses(),
          getEmployeesLite(),
          getDepartments(),
        ]);
        return (
          <AssignPanel
            requests={adminReqs}
            courses={courses.filter((c) => c.is_active).map((c) => ({ id: c.id, title: c.title }))}
            employees={employees}
            departments={departments}
          />
        );
      }
      case "rpt-period": {
        const iso = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
        const today = new Date().toISOString().slice(0, 10);
        const f = iso(from) ?? `${today.slice(0, 4)}-01-01`;
        const t = iso(to) ?? today;
        const [stats, budgets] = await Promise.all([getPeriodTrainingStats(f, t), getBudgets()]);
        return <PeriodReportPanel data={stats} currency={budgets[0]?.currency ?? "USD"} />;
      }
      case "rpt-compare": {
        const iso = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
        const yNow = new Date().getUTCFullYear();
        const fA = iso(from) ?? `${yNow}-01-01`;
        const tA = iso(to) ?? `${yNow}-12-31`;
        const fB = iso(fromB) ?? `${yNow - 1}-01-01`;
        const tB = iso(toB) ?? `${yNow - 1}-12-31`;
        const [a, b, budgets] = await Promise.all([
          getPeriodTrainingStats(fA, tA),
          getPeriodTrainingStats(fB, tB),
          getBudgets(),
        ]);
        return <ComparativeReportPanel a={a} b={b} currency={budgets[0]?.currency ?? "USD"} />;
      }
      case "matrix-global": {
        const data = await getGlobalTrainingMatrix();
        const selectedDept = dept && data.departments.includes(dept) ? dept : null;
        return <GlobalMatrixPanel data={data} dept={selectedDept} />;
      }
      case "exec-summary": {
        const y = year && /^\d{4}$/.test(year) ? Number(year) : new Date().getUTCFullYear();
        return <ExecSummaryPanel data={await getExecutiveSummary(y)} />;
      }
      case "scheduler": {
        const [courses, employees] = await Promise.all([getCourses(), getSchedulerPool()]);
        return (
          <TrainingScheduler
            courses={courses.filter((c) => c.is_active).map((c) => ({ id: c.id, title: c.title }))}
            employees={employees}
          />
        );
      }
      case "annual-plan": {
        const [items, employees, courses] = await Promise.all([getPlanItemsAll(), getEmployeesLite(), getCourses()]);
        return (
          <AnnualPlanPanel
            items={items}
            employees={employees}
            courses={courses.filter((c) => c.is_active).map((c) => ({ id: c.id, title: c.title }))}
          />
        );
      }
      case "budgets": {
        const [budgets, cost] = await Promise.all([getBudgets(), getCostReport()]);
        return <BudgetsPanel budgets={budgets} scheduledCost={cost.total} />;
      }
      case "evaluations": {
        const sessions = await getSessions();
        const selected = session && sessions.some((s) => s.id === session) ? session : null;
        const [participants, evaluations] = selected
          ? await Promise.all([getParticipants(selected), getEvaluations(selected)])
          : [[], []];
        return (
          <EvaluationsPanel sessions={sessions} selectedId={selected} participants={participants} evaluations={evaluations} />
        );
      }
      case "course-history": {
        const courses = await getCourses();
        const selected = course && courses.some((c) => c.id === course) ? course : null;
        const history = selected ? await getCourseHistory(selected) : null;
        // The most recent session opens pre-expanded, so preload its people.
        const firstId = history?.sessions[0]?.id ?? null;
        const initialParticipants = firstId
          ? (await getParticipants(firstId)).map((p) => ({
              full_name: p.full_name,
              status: p.status,
              score: p.score,
            }))
          : [];
        return (
          <CourseHistoryPanel
            courses={courses.map((c) => ({ id: c.id, title: c.title, code: c.code ?? null }))}
            selected={selected}
            history={history}
            initialParticipants={initialParticipants}
          />
        );
      }
      case "providers":
        return <ProvidersPanel providers={await getProviders()} />;
      case "trainers": {
        const [trainers, providers] = await Promise.all([getTrainers(), getProviders()]);
        return <TrainersPanel trainers={trainers} providers={providers} />;
      }
      case "sessions": {
        const [sessions, courses, trainers] = await Promise.all([getSessions(), getCourses(), getTrainers()]);
        return (
          <SessionsPanel
            sessions={sessions}
            courses={courses.filter((c) => c.is_active).map((c) => ({ id: c.id, title: c.title }))}
            trainers={trainers}
          />
        );
      }
      case "participants": {
        const [sessions, employees] = await Promise.all([getSessions(), getEmployeesLite()]);
        const selected = session && sessions.some((s) => s.id === session) ? session : null;
        const participants = selected ? await getParticipants(selected) : [];
        return (
          <ParticipantsPanel
            sessions={sessions}
            selectedId={selected}
            participants={participants}
            employees={employees}
          />
        );
      }
      case "rpt-compliance":
        return <ComplianceReportPanel data={await getComplianceReport()} />;
      case "rpt-expiring":
        return <ExpiringReportPanel rows={await getExpiringReport()} />;
      case "rpt-costs":
        return <CostReportPanel data={await getCostReport()} />;
      case "rpt-plan-progress":
        return <PlanProgressReportPanel data={await getPlanProgressReport()} />;
      case "rpt-effectiveness":
        return <EffectivenessReportPanel data={await getEffectivenessReport()} />;
      case "rpt-origins":
        return <RequestsByOriginReportPanel data={await getRequestsByOrigin()} />;
      case "my-competencies":
        return <SelfCompetenciesPanel items={await getMyCompetencies()} />;
      case "competencies": {
        const [competencies, links, courses] = await Promise.all([
          getCompetencies(),
          getCompetencyLinks(),
          getCourses(),
        ]);
        return (
          <CompetenciesPanel
            competencies={competencies}
            links={links}
            courses={courses.filter((c) => c.is_active).map((c) => ({ id: c.id, title: c.title }))}
          />
        );
      }
      case "competency-matrix": {
        const employees = await getEmployeesLite();
        const selected = person && employees.some((e) => e.id === person) ? person : null;
        const items = selected ? await getEmployeeCompetencies(selected) : [];
        return <CompetencyMatrixPanel employees={employees} selectedId={selected} items={items} />;
      }
      case "competency-holders": {
        const competencies = await getCompetencies();
        const active = competencies.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name }));
        const selected = competency && active.some((c) => c.id === competency) ? competency : null;
        const roster = selected ? await getCompetencyRoster(selected) : { competency: null, people: [] };
        return <CompetencyHoldersPanel key={selected ?? "none"} competencies={active} selectedId={selected} roster={roster} />;
      }
      default:
        return <PlannedPanel label={meta?.label ?? "This view"} />;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <GraduationCap className="h-6 w-6 text-primary" /> Training &amp; Competence
        </h1>
        <p className="text-muted-foreground">
          {hub && hub.label !== meta?.label
            ? `${hub.group} · ${hub.label} · ${meta?.label ?? ""}`
            : meta?.group
              ? `${meta.group} · ${meta.label}`
              : "Courses, compliance, certificates and competencies."}
        </p>
      </div>
      {hub?.tabs && hub.tabs.length > 1 && <ViewTabs tabs={hub.tabs} current={key} />}
      {await body()}
    </div>
  );
}
