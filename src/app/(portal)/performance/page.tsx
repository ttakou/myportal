import Link from "next/link";
import { ArrowRight, ClipboardCheck, FileBarChart, Settings } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getActiveCycle, getMyAppraisal, getMyDirectLine } from "@/lib/appraisals";
import { DirectLinePanel } from "./_components/direct-line-panel";
import { MyPerformanceSummary } from "./_components/my-performance-summary";

export default async function PerformancePage() {
  const access = await getAccess();

  // The performance home doubles as the user's dashboard: lead with their own
  // goals + development plan, then — for line managers — their direct line, so
  // everyone can see and act on performance without hunting for it.
  const cycle = await getActiveCycle();
  const [myAppraisal, directLine] = await Promise.all([
    cycle ? getMyAppraisal(cycle.id) : Promise.resolve(null),
    getMyDirectLine(cycle?.id ?? null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Performance Management</h1>
        <p className="text-muted-foreground">Annual performance appraisals.</p>
        {(access.isHr || access.isSystemAdmin || access.isAdmin) && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href="/reports/performance-appraisals"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <FileBarChart className="h-4 w-4" /> Completion &amp; SLA report
            </Link>
            <Link
              href="/performance/settings"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Settings className="h-4 w-4" /> Performance settings
            </Link>
          </div>
        )}
      </div>

      <MyPerformanceSummary
        appraisal={myAppraisal}
        cycleName={cycle?.name ?? null}
        hasCycle={!!cycle}
      />

      <DirectLinePanel reports={directLine} cycleName={cycle?.name ?? null} />

      <Link
        href="/performance/appraisals"
        className="group flex items-center justify-between gap-4 rounded-lg border bg-card p-5 shadow-sm transition hover:bg-accent"
      >
        <div className="flex items-start gap-3">
          <ClipboardCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Annual appraisals</p>
            <p className="text-sm text-muted-foreground">
              Set objectives, track progress, complete your self-assessment, manager review,
              calibration and the final outcome.
            </p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
