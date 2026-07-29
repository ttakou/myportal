import { getAccess } from "@/lib/auth";
import { getPobBreakdown, getRotationFlags } from "@/lib/offshore";
import { ROTATION_FLAG_KIND_LABEL, ROTATION_FLAG_REASON_LABEL, type PobOnboard } from "@/types/offshore";
import { ReportHeader, ReportStampFooter } from "@/components/ui/report-letterhead";
import { PrintButton } from "../offshore-manifest/[id]/print-button";

/** Standalone, print-friendly POB / muster roster — everyone on board now,
 *  grouped by lifeboat station, for the noticeboard and emergency use. */
export default async function PobRosterPage() {
  const access = await getAccess();
  if (!access.isAdmin && !access.isCampboss && !access.isOim) {
    return <p className="p-8 text-sm text-muted-foreground">Not authorized to view this report.</p>;
  }

  const [pob, flags] = await Promise.all([getPobBreakdown(), getRotationFlags()]);
  const now = new Date();
  const stamp = now.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

  // Group on-board people by lifeboat; the "Unassigned" bucket sorts last.
  const byLb = new Map<string, PobOnboard[]>();
  for (const p of pob.people) {
    const k = p.lifeboat ?? "Unassigned";
    byLb.set(k, [...(byLb.get(k) ?? []), p]);
  }
  const groups = [...byLb.entries()].sort((a, b) => {
    if (a[0] === "Unassigned") return 1;
    if (b[0] === "Unassigned") return -1;
    return a[0].localeCompare(b[0], undefined, { numeric: true });
  });
  for (const [, list] of groups) list.sort((a, b) => a.name.localeCompare(b.name));

  const th = "px-2 py-1 text-left font-semibold text-gray-600";
  const td = "px-2 py-1 align-top";

  return (
    <div className="bg-gray-100 p-6 print:bg-white print:p-0">
      <style>{`
        @media print { @page { size: A4 portrait; margin: 10mm; } }
        .pob-report, .pob-report * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `}</style>

      <div className="mx-auto mb-3 flex max-w-[900px] items-center gap-2 print:hidden">
        <PrintButton />
      </div>

      <div className="pob-report mx-auto max-w-[900px] bg-white p-6 shadow-sm print:max-w-none print:shadow-none">
        <ReportHeader title="POB & muster roster" subtitle={`As of ${stamp} UTC · ${pob.total} on board`} />

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-700">
          <span className="font-semibold">{pob.total} on board</span>
          <span>{pob.byCategory.staff} staff</span>
          <span>{pob.byCategory.visitor} visitors</span>
          {pob.byLifeboat.map((lb) => (
            <span key={lb.name}>{lb.name}: {lb.pob}</span>
          ))}
        </div>

        {groups.map(([lb, people]) => (
          <div key={lb} className="mt-4" style={{ breakInside: "avoid" }}>
            <h2 className="mb-1 text-sm font-bold text-gray-900">
              {lb === "Unassigned" ? "Unassigned lifeboat" : `Lifeboat ${lb}`} · {people.length}
            </h2>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-y border-gray-300 bg-gray-50">
                  <th className={`${th} w-6`}>#</th>
                  <th className={th}>Name</th>
                  <th className={th}>Category</th>
                  <th className={th}>Company</th>
                  <th className={th}>Room · bed</th>
                  <th className={th}>Crew</th>
                  <th className={th}>On board since</th>
                  <th className={`${th} w-16`}>Present</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p, i) => (
                  <tr key={p.trip_id} className="border-b border-gray-100">
                    <td className={`${td} tabular-nums text-gray-400`}>{i + 1}</td>
                    <td className={`${td} font-semibold`} style={{ color: "#dc2626" }}>{p.name}</td>
                    <td className={`${td} capitalize text-gray-700`}>{p.category}</td>
                    <td className={`${td} text-gray-700`}>{p.company ?? "—"}</td>
                    <td className={`${td} text-gray-700`}>
                      {p.room_label ?? "—"}{p.bed_no ? ` · ${p.bed_no}` : ""}
                    </td>
                    <td className={`${td} text-gray-700`}>{p.crew_name ?? "—"}</td>
                    <td className={`${td} tabular-nums text-gray-700`}>{p.mobilize_date}</td>
                    {/* Blank box for a manual roll-call tick during a real muster. */}
                    <td className={td}><span className="inline-block h-3 w-3 border border-gray-400" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {pob.people.length === 0 && <p className="mt-4 text-sm text-gray-400">Nobody is currently on board.</p>}

        {flags.length > 0 && (
          <div className="mt-5" style={{ breakInside: "avoid" }}>
            <h2 className="mb-1 text-sm font-bold text-gray-900">Flagged absences & exceptions · {flags.length}</h2>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-y border-gray-300 bg-gray-50">
                  <th className={th}>Name</th>
                  <th className={th}>Flag</th>
                  <th className={th}>Reason</th>
                  <th className={th}>Date</th>
                  <th className={th}>Note</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((f) => (
                  <tr key={f.id} className="border-b border-gray-100">
                    <td className={`${td} font-semibold text-gray-800`}>{f.name}</td>
                    <td className={`${td} text-gray-700`}>{ROTATION_FLAG_KIND_LABEL[f.kind]}</td>
                    <td className={`${td} text-gray-700`}>{ROTATION_FLAG_REASON_LABEL[f.reason]}</td>
                    <td className={`${td} tabular-nums text-gray-700`}>{f.effective_date}</td>
                    <td className={`${td} text-gray-600`}>{f.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ReportStampFooter label="POB & muster roster" />
      </div>
    </div>
  );
}
