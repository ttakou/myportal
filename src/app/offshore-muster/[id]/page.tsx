import { getAccess } from "@/lib/auth";
import { getMusterDrill } from "@/lib/offshore";
import { mmss, MUSTER_OUTCOME_LABEL, musterHeadline, musterSummary } from "@/lib/offshore/muster-closeout";
import { ReportHeader, ReportStampFooter } from "@/components/ui/report-letterhead";
import { PrintButton } from "../../offshore-manifest/[id]/print-button";

/**
 * Printable muster roll-call (after-action) report with tenant branding.
 *
 * Per lifeboat: who was accounted and when, who failed to muster, who was
 * never on board. The header says whether the platform reached all clear
 * and how long it took; the close-out note and who signed it off sit at the
 * foot. A voided roll-call prints as such.
 */
export default async function MusterReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getAccess();
  if (!access.isAdmin && !access.isCampboss && !access.isOim) {
    return <p className="p-8 text-sm text-muted-foreground">Not authorized to view this report.</p>;
  }
  const drill = await getMusterDrill(id);
  if (!drill) return <p className="p-8 text-sm text-muted-foreground">Roll-call not found.</p>;

  const summary = musterSummary(drill.checkins, drill.started_at);
  const byGroup = new Map<string, typeof drill.checkins>();
  for (const c of drill.checkins) {
    const g = c.lifeboat || "Unassigned";
    byGroup.set(g, [...(byGroup.get(g) ?? []), c]);
  }
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC" : "—");
  const clock = (d: string | null) => (d ? new Date(d).toISOString().slice(11, 19) : "");
  const state = drill.voided
    ? "VOID"
    : drill.closed_out_at
      ? `closed out ${fmt(drill.closed_out_at)}${drill.closed_out_by_name ? ` by ${drill.closed_out_by_name}` : ""}`
      : drill.ended_at
        ? "ended, not closed out"
        : "OPEN";

  const tone = (o: (typeof drill.checkins)[number]["outcome"]) =>
    o === "accounted"
      ? "text-green-700"
      : o === "no_show"
        ? "font-semibold text-red-600"
        : o === "not_on_board"
          ? "text-gray-500"
          : "font-semibold text-amber-700";

  return (
    <div className="bg-gray-100 p-6 print:bg-white print:p-0">
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } } .mr,.mr * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }`}</style>
      <div className="mx-auto mb-3 flex max-w-[800px] items-center gap-2 print:hidden">
        <PrintButton />
        <a href={`/offshore-export?type=muster&id=${drill.id}`} className="inline-flex items-center rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">Download CSV</a>
      </div>

      <div className="mr relative mx-auto max-w-[800px] bg-white p-6 shadow-sm print:max-w-none print:shadow-none">
        {drill.voided && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rotate-[-20deg] border-8 border-gray-300 px-8 py-2 text-7xl font-black tracking-widest text-gray-300">
              VOID
            </span>
          </div>
        )}
        <ReportHeader
          title={`Muster roll-call${drill.kind === "real" ? " — Emergency" : " — Drill"}`}
          subtitle={`${musterHeadline(summary)} · started ${fmt(drill.started_at)}${
            drill.ended_at ? ` · ended ${fmt(drill.ended_at)}` : ""
          } · ${state}`}
        />

        <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[12px]">
          <Tile label="Expected" value={summary.expected} />
          <Tile label="Accounted" value={summary.accounted} tone="text-green-700" />
          <Tile label="No-show" value={summary.noShow} tone={summary.noShow ? "text-red-600" : undefined} />
          <Tile
            label="All clear"
            value={summary.secondsToAllClear != null ? mmss(summary.secondsToAllClear) : summary.open > 0 ? "open" : "never"}
            tone={summary.secondsToAllClear != null ? "text-green-700" : "text-red-600"}
          />
        </div>
        {summary.notOnBoard > 0 && (
          <p className="mt-1 text-[11px] text-gray-500">
            {summary.notOnBoard} on the POB snapshot were found not to be on board and are not counted as expected.
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          {summary.byLifeboat.map((g) => {
            const people = byGroup.get(g.lifeboat) ?? [];
            return (
              <div key={g.lifeboat} className="rounded border border-gray-200 p-2 text-[12px]" style={{ breakInside: "avoid" }}>
                <div className="mb-1 flex items-center justify-between font-semibold text-gray-900">
                  <span>Muster {g.lifeboat}</span>
                  <span className={g.accounted < g.total - g.notOnBoard ? "text-red-600" : "text-green-700"}>
                    {g.accounted}/{g.total - g.notOnBoard}
                    {g.noShow > 0 && <span className="ml-1 font-normal">· {g.noShow} no-show</span>}
                    {g.open > 0 && <span className="ml-1 font-normal text-amber-700">· {g.open} open</span>}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {people.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span className={p.outcome === "not_on_board" ? "text-gray-400 line-through" : ""}>{p.name}</span>
                      <span className={tone(p.outcome)}>
                        {p.outcome === "accounted"
                          ? `✓ ${clock(p.accounted_at)}`
                          : p.outcome
                            ? MUSTER_OUTCOME_LABEL[p.outcome].toUpperCase()
                            : "OPEN"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {drill.close_note && (
          <div className="mt-4 rounded border border-gray-200 p-2 text-[12px]">
            <p className="font-semibold text-gray-900">Close-out note</p>
            <p className="whitespace-pre-wrap">{drill.close_note}</p>
          </div>
        )}

        <ReportStampFooter label="Muster roll-call" />
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded border border-gray-200 p-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${tone ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}
