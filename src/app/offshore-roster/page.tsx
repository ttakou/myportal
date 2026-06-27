import { getAccess } from "@/lib/auth";
import { getRoster } from "@/lib/offshore";
import type { RosterEntry } from "@/types/offshore";
import { ReportHeader, ReportStampFooter } from "@/components/ui/report-letterhead";
import { PrintButton } from "../offshore-manifest/[id]/print-button";

/** Standalone, print-friendly offshore-staff roster with default room allocation. */
export default async function RosterReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const access = await getAccess();
  if (!access.isAdmin && !access.isCampboss && !access.isOim) {
    return <p className="p-8 text-sm text-muted-foreground">Not authorized to view this report.</p>;
  }

  const date = sp.date || new Date().toISOString().slice(0, 10);
  const roster = await getRoster();
  const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  // Group by crew, then name.
  const byCrew = new Map<string, RosterEntry[]>();
  for (const m of [...roster].sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""))) {
    const k = m.crew_name ?? "Unassigned";
    byCrew.set(k, [...(byCrew.get(k) ?? []), m]);
  }
  const crews = [...byCrew.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const th = "px-2 py-1 text-left font-semibold text-gray-600";
  const td = "px-2 py-1 align-top";

  return (
    <div className="bg-gray-100 p-6 print:bg-white print:p-0">
      <style>{`
        @media print { @page { size: A4 landscape; margin: 10mm; } }
        .roster-report, .roster-report * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `}</style>

      <div className="mx-auto mb-3 flex max-w-[1100px] items-center gap-2 print:hidden">
        <PrintButton />
        <a
          href="/offshore-export?type=roster"
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Download CSV
        </a>
      </div>

      <div className="roster-report mx-auto max-w-[1100px] bg-white p-6 shadow-sm print:max-w-none print:shadow-none">
        <ReportHeader
          title="Offshore staff · default room allocation"
          subtitle={`As of ${fmt(date)} · ${roster.length} staff`}
        />

        {crews.map(([crew, members]) => (
          <div key={crew} className="mt-4" style={{ breakInside: "avoid" }}>
            <h2 className="mb-1 text-sm font-bold text-gray-900">{crew} · {members.length}</h2>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-y border-gray-300 bg-gray-50">
                  <th className={`${th} w-6`}>#</th>
                  <th className={th}>Default owner</th>
                  <th className={th}>Company</th>
                  <th className={th}>Default room · bed</th>
                  <th className={th}>Muster</th>
                  <th className={th}>Back-to-back</th>
                  <th className={th}>Medical</th>
                  <th className={th}>BOSIET</th>
                  <th className={th}>HUET</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.id} className="border-b border-gray-100">
                    <td className={`${td} tabular-nums text-gray-400`}>{i + 1}</td>
                    <td className={`${td} font-semibold`} style={{ color: "#dc2626" }}>{m.full_name || m.email}</td>
                    <td className={`${td} text-gray-700`}>{m.company ?? "—"}</td>
                    <td className={`${td} text-gray-700`}>
                      {m.fixed_room_label ?? "—"}{m.fixed_bed ? ` · ${m.fixed_bed}` : ""}
                    </td>
                    <td className={`${td} text-gray-700`}>{m.lifeboat ?? "—"}</td>
                    <td className={`${td} text-gray-700`}>{m.back_to_back_name ?? "—"}</td>
                    <td className={`${td} text-gray-700`}>{m.medical_expiry ?? "—"}</td>
                    <td className={`${td} text-gray-700`}>{m.bosiet_expiry ?? "—"}</td>
                    <td className={`${td} text-gray-700`}>{m.huet_expiry ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {roster.length === 0 && <p className="mt-4 text-sm text-gray-400">No offshore staff on the roster.</p>}

        <ReportStampFooter label="Default room allocation" />
      </div>
    </div>
  );
}
