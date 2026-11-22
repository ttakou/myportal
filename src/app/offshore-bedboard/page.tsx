import { getAccess } from "@/lib/auth";
import { getPobBreakdown, getRooms } from "@/lib/offshore";
import { GENDER_LABEL, ROOM_STATUS_LABEL, type Room } from "@/types/offshore";
import { ReportHeader, ReportStampFooter } from "@/components/ui/report-letterhead";
import { PrintButton } from "../offshore-manifest/[id]/print-button";

/**
 * Standalone, print-friendly bed board: every usable room as it stands now,
 * who is in each bed and how many beds are free. Takes the board's own
 * filters (`q`, `free=1`) so what prints is what was on screen.
 */
export default async function BedBoardPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; free?: string }>;
}) {
  const sp = await searchParams;
  const access = await getAccess();
  if (!access.isAdmin && !access.isCampboss && !access.isOim && !access.isDispatcher) {
    return <p className="p-8 text-sm text-muted-foreground">Not authorized to view this report.</p>;
  }

  const [rooms, pob] = await Promise.all([getRooms(), getPobBreakdown()]);
  const needle = (sp.q ?? "").trim().toLowerCase();
  const freeOnly = sp.free === "1";

  const labelOf = (r: Room) => [r.block, r.room_number].filter(Boolean).join(" ");
  const freeOf = (r: Room) => Math.max(0, (r.bed_count || 0) - r.occupants.length);
  const usable = rooms.filter((r) => !["blocked", "maintenance"].includes(r.status));
  const visible = usable
    .filter((r) => {
      if (freeOnly && freeOf(r) <= 0) return false;
      if (!needle) return true;
      return [r.block, r.floor, r.room_number, r.lifeboat].filter(Boolean).join(" ").toLowerCase().includes(needle);
    })
    .sort((a, b) => labelOf(a).localeCompare(labelOf(b), undefined, { numeric: true }));

  const totalFree = usable.reduce((n, r) => n + Math.max(0, (r.bed_count || 0) - r.occupied), 0);
  const waiting = pob.people.filter((p) => !p.room_id).sort((a, b) => a.name.localeCompare(b.name));
  const stamp = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Douala",
  });
  const filters = [needle && `rooms matching “${sp.q}”`, freeOnly && "rooms with a free bed only"].filter(Boolean).join(" · ");

  return (
    <div className="bg-gray-100 p-6 print:bg-white print:p-0">
      <style>{`
        @media print { @page { size: A4 landscape; margin: 10mm; } }
        .bed-report, .bed-report * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `}</style>

      <div className="mx-auto mb-3 flex max-w-[1100px] items-center gap-2 print:hidden">
        <PrintButton />
        <a href="/offshore?view=bedboard" className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50">
          Back to the bed board
        </a>
      </div>

      <div className="bed-report mx-auto max-w-[1100px] bg-white p-6 shadow-sm print:max-w-none print:shadow-none">
        <ReportHeader
          title="Bed board"
          subtitle={`As of ${stamp} · ${totalFree} free bed(s) · ${waiting.length} on board waiting for a bed${filters ? ` · ${filters}` : ""}`}
        />

        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {visible.map((r) => {
            const beds = r.bed_count || 0;
            const free = freeOf(r);
            const over = r.occupied > beds;
            return (
              <div key={r.id} className="rounded border border-gray-200 p-1.5 text-[10px] leading-tight" style={{ breakInside: "avoid" }}>
                <div className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <span className="font-semibold text-gray-900">
                    {labelOf(r) || "—"}
                    {r.lifeboat ? <span className="ml-1 rounded bg-sky-100 px-1 text-[9px] text-sky-800">LB {r.lifeboat}</span> : null}
                  </span>
                  <span className={over ? "font-semibold text-red-600" : free > 0 ? "font-semibold text-green-700" : "text-gray-500"}>
                    {r.occupied}/{beds}
                    {over ? " · hot-bunk" : free > 0 ? ` · ${free} free` : " · full"}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1 text-[9px] text-gray-500">
                  <span>{r.room_type}</span>
                  {r.gender_restriction !== "any" && <span>· {GENDER_LABEL[r.gender_restriction]}</span>}
                  {r.status !== "available" && <span>· {ROOM_STATUS_LABEL[r.status]}</span>}
                </div>
                <ul className="mt-1 space-y-0.5 text-gray-700">
                  {r.occupants.map((o) => (
                    <li key={o.trip_id}>
                      {o.name}
                      {o.kind === "visitor" ? <span className="ml-1 text-violet-700">(visitor)</span> : null}
                    </li>
                  ))}
                  {r.occupants.length === 0 && <li className="text-gray-400">Empty</li>}
                </ul>
              </div>
            );
          })}
          {visible.length === 0 && <p className="text-sm text-gray-500">No room to show.</p>}
        </div>

        {waiting.length > 0 && (
          <div className="mt-4" style={{ breakInside: "avoid" }}>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">On board waiting for a bed</h2>
            <p className="text-[11px] text-gray-700">
              {waiting.map((p) => (p.company ? `${p.name} (${p.company})` : p.name)).join(" · ")}
            </p>
          </div>
        )}

        <ReportStampFooter label="Bed board" />
      </div>
    </div>
  );
}
