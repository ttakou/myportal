import { getAccess } from "@/lib/auth";
import { getTenantBranding } from "@/lib/branding";
import { getEmergencyRoles, getRotationReport } from "@/lib/offshore";
import { EMERGENCY_ROLE_LABEL, type EmergencyRoleKind, type RotationDay } from "@/types/offshore";
import { PrintButton } from "../offshore-manifest/[id]/print-button";

const CELL: Record<RotationDay, string> = {
  offshore: "#dc2626",
  onshore: "#2563eb",
  change_out: "#f59e0b",
  change_in: "#22c55e",
};

const ROLE_ORDER: EmergencyRoleKind[] = ["evac_leader", "evac_assistant", "headcount_principal", "headcount_assistant"];

/** Standalone, A3-landscape rotation calendar report with tenant branding. */
export default async function RotationReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; weeks?: string }>;
}) {
  const sp = await searchParams;
  const access = await getAccess();
  if (!access.isAdmin && !access.isSafetyAdmin && !access.isOim) {
    return <p className="p-8 text-sm text-muted-foreground">Not authorized to view this report.</p>;
  }

  const from = sp.from || new Date().toISOString().slice(0, 10);
  const weeks = Math.max(1, Math.min(26, Number(sp.weeks) || 8));
  const [report, branding, emergencyRoles] = await Promise.all([
    getRotationReport(from, weeks),
    getTenantBranding(),
    getEmergencyRoles(),
  ]);

  // Muster-role windows overlapping the report range, grouped by window then group.
  const windowMap = new Map<string, { from: string; to: string; groups: Map<string, typeof emergencyRoles> }>();
  for (const r of emergencyRoles) {
    if (r.from_date > report.to || r.to_date < report.from) continue; // outside range
    const wk = r.from_date + "|" + r.to_date;
    if (!windowMap.has(wk)) windowMap.set(wk, { from: r.from_date, to: r.to_date, groups: new Map() });
    const w = windowMap.get(wk)!;
    w.groups.set(r.lifeboat, [...(w.groups.get(r.lifeboat) ?? []), r]);
  }
  const musterWindows = [...windowMap.values()].sort((a, b) => a.from.localeCompare(b.from));

  const fmt = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  return (
    <div className="bg-gray-100 p-6 print:bg-white print:p-0">
      {/* A3 landscape + keep background colours when printing */}
      <style>{`
        @media print { @page { size: A3 landscape; margin: 10mm; } }
        .rotation-report, .rotation-report * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      `}</style>

      <div className="mx-auto mb-3 flex max-w-[1500px] items-center gap-2 print:hidden">
        <PrintButton />
        <a
          href={`/offshore-export?type=rotation&from=${from}&weeks=${weeks}`}
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Download CSV
        </a>
      </div>

      <div className="rotation-report mx-auto max-w-[1500px] bg-white p-6 shadow-sm print:max-w-none print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-3">
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.name} className="h-12 w-auto object-contain" />
            ) : null}
            <div className="text-lg font-bold text-gray-900">{branding.name}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold tracking-tight text-gray-900">CREW ROTATION CALENDAR</div>
            <div className="text-xs text-gray-500">
              {fmt(report.from)} → {fmt(report.to)} · {weeks} weeks
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 py-2 text-[11px] text-gray-600">
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: CELL.offshore }} /> Offshore</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: CELL.onshore }} /> Onshore</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: CELL.change_out }} /> Crew change (out)</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: CELL.change_in }} /> Crew change (in)</span>
        </div>

        {/* Gantt */}
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-1 py-1 text-left">Crew</th>
              {report.days.map((d, i) => (
                <th key={d} className="px-0 py-1 text-center font-normal text-gray-400" style={{ minWidth: 8 }}>
                  {i % 7 === 0 ? <span className="block text-[8px]">{fmt(d)}</span> : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.crews.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="sticky left-0 bg-white px-1 py-0.5 align-top">
                  <div className="font-semibold text-gray-900">{c.name}</div>
                  <div className="text-[8px] text-gray-400">{c.offshore_days}/{c.onshore_days} · {c.member_count}</div>
                </td>
                {c.statuses.map((s, i) => (
                  <td key={i} className="p-0">
                    <div style={{ height: 18, width: "100%", background: s ? CELL[s] : "transparent" }} title={`${report.days[i]}${s ? " · " + s.replace("_", " ") : ""}`} />
                  </td>
                ))}
              </tr>
            ))}
            {report.crews.length === 0 && (
              <tr><td colSpan={report.days.length + 1} className="px-2 py-4 text-center text-gray-400">No crews with a cycle start to plot.</td></tr>
            )}
          </tbody>
        </table>

        {/* Crews · back-to-back & members */}
        <h2 className="mt-6 mb-2 text-sm font-bold text-gray-900">Crews · back-to-back &amp; members</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" style={{ breakInside: "avoid" }}>
          {report.crews.map((c) => (
            <div key={c.id} className="rounded border border-gray-200 p-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">{c.name}</span>
                <span className="text-gray-500">{c.offshore_days}/{c.onshore_days} · {c.members.length}</span>
              </div>
              <div className="text-gray-600">Back-to-back: <span className="font-medium text-gray-900">{c.back_to_back ?? "—"}</span></div>
              <ol className="mt-1 space-y-0.5 text-gray-700">
                {c.members.map((m, i) => (
                  <li key={i}><span className="mr-1 tabular-nums text-gray-400">{i + 1}.</span>{m}</li>
                ))}
                {c.members.length === 0 && <li className="text-gray-400">No members.</li>}
              </ol>
            </div>
          ))}
        </div>

        {/* Muster roles per rotation window */}
        {musterWindows.length > 0 && (
          <>
            <h2 className="mt-6 mb-2 text-sm font-bold text-gray-900">Muster roles by rotation window</h2>
            <div className="space-y-3">
              {musterWindows.map((w) => (
                <div key={w.from + w.to} style={{ breakInside: "avoid" }}>
                  <div className="mb-1 text-[11px] font-semibold text-gray-700">
                    {fmt(w.from)} → {fmt(w.to)}
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[...w.groups.entries()]
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([group, rows]) => (
                        <div key={group} className="rounded border border-gray-200 p-2 text-[11px]">
                          <div className="mb-1 font-semibold text-gray-900">Muster {group}</div>
                          <ul className="space-y-0.5">
                            {ROLE_ORDER.map((role) => {
                              const holder = rows.find((r) => r.role === role);
                              return (
                                <li key={role} className="flex justify-between gap-2">
                                  <span className="text-gray-500">{EMERGENCY_ROLE_LABEL[role]}</span>
                                  <span className="font-medium text-gray-900">{holder?.person_name ?? "—"}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-6 border-t border-gray-200 pt-2 text-[9px] text-gray-400">
          {branding.name} · Crew rotation calendar · Generated {new Date().toLocaleString("en-GB", { timeZone: "UTC" })} UTC
        </div>
      </div>
    </div>
  );
}
