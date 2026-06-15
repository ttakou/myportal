import { getAccess } from "@/lib/auth";
import { getTenantBranding } from "@/lib/branding";
import { getRoomAllocationAsOf } from "@/lib/offshore";
import { PrintButton } from "../offshore-manifest/[id]/print-button";

/** Standalone, print-friendly room allocation report as of a date, with branding. */
export default async function RoomAllocationReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const access = await getAccess();
  if (!access.isAdmin && !access.isSafetyAdmin && !access.isOim) {
    return <p className="p-8 text-sm text-muted-foreground">Not authorized to view this report.</p>;
  }

  const date = sp.date || new Date().toISOString().slice(0, 10);
  const [report, branding] = await Promise.all([getRoomAllocationAsOf(date), getTenantBranding()]);
  const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="bg-gray-100 p-6 print:bg-white print:p-0">
      <style>{`
        @media print { @page { size: A4 landscape; margin: 10mm; } }
        .room-report, .room-report * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `}</style>

      <div className="mx-auto mb-3 flex max-w-[1100px] items-center gap-2 print:hidden">
        <PrintButton />
        <a
          href={`/offshore-export?type=rooms&date=${date}`}
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Download CSV
        </a>
      </div>

      <div className="room-report mx-auto max-w-[1100px] bg-white p-6 shadow-sm print:max-w-none print:shadow-none">
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
            <div className="text-xl font-bold tracking-tight text-gray-900">ROOM ALLOCATION</div>
            <div className="text-xs text-gray-500">
              As of {fmt(report.date)} · {report.roomsInUse} room(s) in use · {report.totalOccupants} occupant(s)
            </div>
          </div>
        </div>

        {/* Room grid */}
        <div className="mt-3 grid grid-cols-3 gap-2" style={{ breakInside: "auto" }}>
          {report.rooms.map((r) => {
            const over = r.occupants.length > r.beds;
            return (
              <div key={r.id} className="rounded border border-gray-200 p-2 text-[11px]" style={{ breakInside: "avoid" }}>
                <div className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <span className="font-semibold text-gray-900">
                    {r.label}
                    {r.lifeboat ? <span className="ml-1 rounded bg-sky-100 px-1 text-[9px] text-sky-800">{r.lifeboat}</span> : null}
                  </span>
                  <span className={over ? "font-semibold text-red-600" : r.occupants.length ? "font-semibold text-green-700" : "text-gray-400"}>
                    {r.occupants.length}/{r.beds}{over ? " · hot-bunk" : ""}
                  </span>
                </div>
                {r.occupants.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-gray-700">
                    {r.occupants.map((o, i) => (
                      <li key={i}>
                        <span className="mr-1 font-mono text-gray-400">{o.bed_no || "•"}</span>
                        {o.name}
                        {o.category === "visitor" ? <span className="ml-1 text-violet-700">(visitor)</span> : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-gray-400">Empty</p>
                )}
                {r.owners.length > 0 && (
                  <div className="mt-1 border-t border-gray-100 pt-1">
                    <p className="text-[10px] font-semibold text-gray-500">Default owner(s)</p>
                    <ul className="mt-0.5 space-y-0.5 text-[10px]">
                      {r.owners.map((o, i) => (
                        <li key={i}>
                          <span style={{ color: "#dc2626", fontWeight: 600 }}>{o.name}</span>
                          {o.bed ? <span className="text-gray-400"> · {o.bed}</span> : ""}
                          {o.back_to_back ? <span className="text-gray-400"> ⇄ {o.back_to_back}</span> : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
          {report.rooms.length === 0 && <p className="text-sm text-gray-400">No rooms.</p>}
        </div>

        <div className="mt-6 border-t border-gray-200 pt-2 text-[9px] text-gray-400">
          {branding.name} · Room allocation · Generated {new Date().toLocaleString("en-GB", { timeZone: "UTC" })} UTC
        </div>
      </div>
    </div>
  );
}
