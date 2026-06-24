import { GraduationCap } from "lucide-react";
import { hasDirectReports } from "@/lib/appraisals";
import {
  getCourses,
  getEmployeesLite,
  getMyCertificates,
  getMyMandatory,
  getMyPlan,
  getMyRequests,
  getMyUpcomingSessions,
  getBudgets,
  getEvaluations,
  getParticipants,
  getPlanItemsAll,
  getProviders,
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
  isTrainingAdmin,
} from "@/lib/training";
import {
  IMPLEMENTED_VIEWS,
  TRAINING_VIEWS,
  canSeeTrainingView,
  resolveTrainingView,
  type TrainingAccess,
} from "./_components/training-views";
import {
  CalendarPanel,
  CertificatesPanel,
  DeptNeedsPanel,
  MandatoryPanel,
  NoAccessPanel,
  PlanPanel,
  PlannedPanel,
  TeamCompliancePanel,
  TeamPlanPanel,
} from "./_components/read-panels";
import { TeamRequestsPanel } from "./_components/team-requests-panel";
import {
  ComplianceReportPanel,
  CostReportPanel,
  EffectivenessReportPanel,
  ExpiringReportPanel,
  PlanProgressReportPanel,
} from "./_components/report-panels";
import { AnnualPlanPanel } from "./_components/annual-plan-panel";
import { BudgetsPanel } from "./_components/budgets-panel";
import { EvaluationsPanel } from "./_components/evaluations-panel";
import { RequestPanel } from "./_components/request-panel";
import { CataloguePanel } from "./_components/catalogue-panel";
import { MatrixPanel } from "./_components/matrix-panel";
import { ProvidersPanel } from "./_components/providers-panel";
import { TrainersPanel } from "./_components/trainers-panel";
import { SessionsPanel } from "./_components/sessions-panel";
import { ParticipantsPanel } from "./_components/participants-panel";

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; session?: string }>;
}) {
  const { view, session } = await searchParams;
  const key = resolveTrainingView(view);
  const [admin, manager] = await Promise.all([isTrainingAdmin(), hasDirectReports()]);
  const access: TrainingAccess = { isManager: manager, isTrainingAdmin: admin };
  const meta = TRAINING_VIEWS.find((v) => v.key === key);

  async function body() {
    if (!canSeeTrainingView(key, access)) return <NoAccessPanel />;
    if (!IMPLEMENTED_VIEWS.has(key)) return <PlannedPanel label={meta?.label ?? "This view"} />;

    switch (key) {
      case "mandatory":
        return <MandatoryPanel items={await getMyMandatory()} />;
      case "certificates":
        return <CertificatesPanel items={await getMyCertificates()} />;
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
        const [requirements, courses] = await Promise.all([getRequirements(), getCourses()]);
        return (
          <MatrixPanel
            requirements={requirements}
            courses={courses.filter((c) => c.is_active).map((c) => ({ id: c.id, title: c.title }))}
          />
        );
      }
      case "team-compliance":
        return <TeamCompliancePanel reports={await getTeamMandatory()} />;
      case "dept-needs":
        return <DeptNeedsPanel reports={await getTeamMandatory()} />;
      case "team-plan":
        return <TeamPlanPanel rows={await getTeamPlan()} />;
      case "team-requests":
        return <TeamRequestsPanel requests={await getTeamRequests()} />;
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
          {meta?.group ? `${meta.group} · ${meta.label}` : "Courses, compliance, certificates and competencies."}
        </p>
      </div>
      {await body()}
    </div>
  );
}
