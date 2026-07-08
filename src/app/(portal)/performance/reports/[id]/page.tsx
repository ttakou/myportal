import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getReportDefinition } from "@/lib/reporting";
import { runReport } from "@/lib/report-run";
import { MEASURE_LABEL } from "@/types/reporting";
import { ReportResultView } from "../_components/report-result";

export default async function ReportRunPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <Link href="/performance" className="text-sm font-medium text-primary hover:underline">
          ← Back to performance
        </Link>
      </div>
    );
  }

  const { id } = await params;
  const def = await getReportDefinition(id);
  if (!def) notFound();
  const result = await runReport(def);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/performance/reports"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{def.name}</h1>
        {def.description && <p className="text-muted-foreground">{def.description}</p>}
      </div>

      {(result.unsupportedMeasures.length > 0 || result.unsupportedDimension) && (
        <p className="rounded-md bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {result.unsupportedDimension && (
            <>Grouping by “{result.unsupportedDimension}” isn’t available yet. </>
          )}
          {result.unsupportedMeasures.length > 0 && (
            <>Not yet computable: {result.unsupportedMeasures.map((m) => MEASURE_LABEL[m]).join(", ")}.</>
          )}
        </p>
      )}

      <ReportResultView name={def.name} result={result} />
    </div>
  );
}
