import { GraduationCap } from "lucide-react";
import { hasDirectReports } from "@/lib/appraisals";
import {
  getCourses,
  getMyCertificates,
  getMyMandatory,
  getMyPlan,
  getMyRequests,
  getMyUpcomingSessions,
  getRequirements,
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
  MandatoryPanel,
  NoAccessPanel,
  PlanPanel,
  PlannedPanel,
} from "./_components/read-panels";
import { RequestPanel } from "./_components/request-panel";
import { CataloguePanel } from "./_components/catalogue-panel";
import { MatrixPanel } from "./_components/matrix-panel";

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
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
