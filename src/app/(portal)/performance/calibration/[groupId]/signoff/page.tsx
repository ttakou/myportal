import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { getPanelData, type PanelData } from "@/lib/calibration-panel";
import { GROUP_BY_LABEL } from "@/types/calibration";
import { ReportHeader } from "@/app/(portal)/reports/_components/report-header";
import { PrintButton } from "@/app/(portal)/reports/_components/print-button";

/** Resolve each person's final outcome from the adjustment trail (newest first). */
function outcomeOf(staff: PanelData["staff"][number], adjustments: PanelData["adjustmentsByStaff"][string]) {
  const latest = adjustments[0];
  const earliest = adjustments[adjustments.length - 1];
  const provisional = earliest?.previousLabel ?? staff.provisionalLabel ?? "—";
  const finalBand =
    latest?.newLabel ?? (staff.gate === "final" ? staff.provisionalLabel : staff.panelBand) ?? "—";
  return { provisional, finalBand, reason: latest?.reason ?? null };
}

export default async function CalibrationSignoffPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">The sign-off pack is managed by HR.</p>
        <Link href="/performance/calibration" className="text-sm font-medium text-primary hover:underline">
          ← Back to calibration
        </Link>
      </div>
    );
  }

  const data = await getPanelData(groupId);
  if (!data) notFound();

  // Cycle name for the letterhead.
  const supabase = createClient();
  const { data: grp } = await supabase
    .from("calibration_groups")
    .select("cycle_id")
    .eq("id", groupId)
    .maybeSingle();
  const cycleId = (grp as { cycle_id?: string } | null)?.cycle_id;
  let cycleName = "";
  if (cycleId) {
    const { data: cyc } = await supabase
      .from("appraisal_cycles")
      .select("name, year")
      .eq("id", cycleId)
      .maybeSingle();
    const c = cyc as { name?: string; year?: number } | null;
    cycleName = String(c?.name ?? c?.year ?? "");
  }

  // Order staff top contributors → lowest by final band, then name.
  const rank = new Map(data.bandOrder.map((label, i) => [label, i]));
  const rankOf = (label: string) => rank.get(label) ?? 99;
  const rows = data.staff
    .map((s) => ({ s, ...outcomeOf(s, data.adjustmentsByStaff[s.appraisalId] ?? []) }))
    .sort((a, b) => rankOf(a.finalBand) - rankOf(b.finalBand) || a.s.name.localeCompare(b.s.name));

  const finalised = data.staff.filter((s) => s.gate === "final").length;
  const groupMeta = [
    cycleName,
    `${GROUP_BY_LABEL[data.group.groupBy]}${data.group.groupValue ? `: ${data.group.groupValue}` : ""}`,
    `${finalised}/${data.staff.length} finalised`,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/performance/calibration/${groupId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Panel
        </Link>
        <PrintButton />
      </div>

      <ReportHeader title="Calibration sign-off" subtitle={data.group.name} meta={groupMeta} />

      {/* Distribution vs target */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Distribution vs target</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Band</th>
              <th className="px-2 py-2 text-right font-medium">Count</th>
              <th className="px-2 py-2 text-right font-medium">Actual %</th>
              <th className="px-2 py-2 text-right font-medium">Target %</th>
              <th className="px-2 py-2 text-right font-medium">Cap</th>
            </tr>
          </thead>
          <tbody>
            {data.balance.bands.map((b) => (
              <tr key={b.label} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{b.label}</td>
                <td className="px-2 py-2 text-right tabular-nums">{b.count}</td>
                <td className="px-2 py-2 text-right tabular-nums">{b.actualPercent}%</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {b.targetPercent != null ? `${b.targetPercent}%` : "—"}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {b.targetMax != null ? b.targetMax : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Final ratings */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Final ratings ({rows.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Employee</th>
              <th className="px-2 py-2 font-medium">Provisional</th>
              <th className="px-2 py-2 font-medium">Panel</th>
              <th className="px-2 py-2 font-medium">Final</th>
              <th className="px-2 py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, provisional, finalBand, reason }) => (
              <tr key={s.appraisalId} className="border-b align-top last:border-0">
                <td className="py-2 pr-4 font-medium">{s.name}</td>
                <td className="px-2 py-2 text-muted-foreground">{provisional}</td>
                <td className="px-2 py-2">{s.panelBand ?? "—"}</td>
                <td className="px-2 py-2 font-medium">{finalBand}</td>
                <td className="px-2 py-2 text-muted-foreground">{reason ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-muted-foreground">No staff in this group.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Sign-off block */}
      <section className="grid gap-8 pt-8 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="h-10 border-b" />
          <p className="text-xs text-muted-foreground">PGM — name &amp; signature</p>
        </div>
        <div className="space-y-1">
          <div className="h-10 border-b" />
          <p className="text-xs text-muted-foreground">Date</p>
        </div>
      </section>
    </div>
  );
}
