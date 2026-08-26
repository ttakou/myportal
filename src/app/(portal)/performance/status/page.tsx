import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getStatusReport } from "@/lib/performance/status-report";
import { StatusReportPanel } from "./_components/status-report-panel";

export const dynamic = "force-dynamic";

/**
 * Where every participant stands, stage by stage — the progress view HR never
 * had. The rating console answers "what did they score"; this answers "has the
 * process actually happened, and who is holding it up".
 */
export default async function StatusReportPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">The status report is for HR and administrators.</p>
        <Link href="/performance" className="text-sm font-medium text-primary hover:underline">
          ← Back to performance
        </Link>
      </div>
    );
  }

  const { cycle } = await searchParams;
  const report = await getStatusReport(cycle ?? null);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/performance"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Performance
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Status report</h1>
        <p className="text-muted-foreground">
          Every participant and how far through the process they are, with the stage each one is
          waiting on. Export the whole table to Excel.
        </p>
      </div>

      <StatusReportPanel report={report} />
    </div>
  );
}
