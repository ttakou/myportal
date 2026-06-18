import Link from "next/link";
import { ArrowRight, ClipboardCheck, FileBarChart } from "lucide-react";
import { getAccess } from "@/lib/auth";

export default async function PerformancePage() {
  const access = await getAccess();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Performance Management</h1>
        <p className="text-muted-foreground">Annual performance appraisals.</p>
        {(access.isHr || access.isSystemAdmin || access.isAdmin) && (
          <Link
            href="/reports/performance-appraisals"
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <FileBarChart className="h-4 w-4" /> Completion &amp; SLA report
          </Link>
        )}
      </div>

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
