import Link from "next/link";
import { ArrowLeft, ChevronRight, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getPerformanceConfig } from "@/lib/performance-config";
import { PerformanceSettingsForm } from "./_components/settings-form";

export default async function PerformanceSettingsPage() {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">Performance settings are available to HR.</p>
        <Link href="/performance" className="text-sm font-medium text-primary hover:underline">
          ← Back to performance
        </Link>
      </div>
    );
  }

  const config = await getPerformanceConfig();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/performance"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Performance
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Performance settings</h1>
        <p className="text-muted-foreground">
          The tenant&apos;s house standard for appraisals. New cycles inherit these defaults.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/performance/settings/scales"
          className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent"
        >
          <span>
            <span className="block font-medium">Rating scales</span>
            <span className="block text-sm text-muted-foreground">
              Scales used to rate goals and competencies.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
        <Link
          href="/performance/settings/cycle-templates"
          className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent"
        >
          <span>
            <span className="block font-medium">Cycle templates</span>
            <span className="block text-sm text-muted-foreground">
              Reusable recipes for each kind of review.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
        <Link
          href="/performance/settings/goal-library"
          className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent"
        >
          <span>
            <span className="block font-medium">Goal library</span>
            <span className="block text-sm text-muted-foreground">
              Reusable corporate / department / team goals.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
        <Link
          href="/performance/settings/continuous"
          className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent"
        >
          <span>
            <span className="block font-medium">Continuous performance</span>
            <span className="block text-sm text-muted-foreground">
              Check-ins, feedback, recognition and notes.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
      </div>

      <PerformanceSettingsForm config={config} />
    </div>
  );
}
