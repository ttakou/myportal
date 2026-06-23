import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldX, FileText } from "lucide-react";
import { getPanelData } from "@/lib/calibration-panel";
import { getDirectory } from "@/lib/continuous";
import { GATE_LABEL } from "@/types/calibration-panel";
import { PanelCalibration } from "../_components/panel-calibration";

export default async function PanelCalibrationPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const data = await getPanelData(groupId);
  if (!data) notFound();

  if (!data.isHr && !data.isMember) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">Only the calibration panel and HR can open this group.</p>
        <Link href="/performance" className="text-sm font-medium text-primary hover:underline">
          ← Back to performance
        </Link>
      </div>
    );
  }

  const directory = data.isHr ? await getDirectory() : [];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/performance/calibration"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Calibration
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Panel calibration — {data.group.name}</h1>
          {data.isHr && (
            <Link
              href={`/performance/calibration/${groupId}/signoff`}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              <FileText className="h-4 w-4" /> Sign-off pack
            </Link>
          )}
        </div>
        <p className="text-muted-foreground">
          Gates: {Object.values(GATE_LABEL).join(" → ")}. The panel rates each staff member; the
          system holds each band to its configured percentage.
        </p>
      </div>

      <PanelCalibration data={data} directory={directory} />
    </div>
  );
}
