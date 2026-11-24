import { getAccess } from "@/lib/auth";
import { manifestDescriptor } from "@/lib/offshore/manifest-label";
import { getManifestById } from "@/lib/offshore";
import { TRIP_TYPE_LABEL } from "@/types/offshore";
import { ReportHeader, ReportStampFooter } from "@/components/ui/report-letterhead";
import { PrintButton } from "./print-button";

/** Standalone, print-friendly passenger manifest report with tenant branding. */
export default async function ManifestReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getAccess();
  // The Dispatcher runs the manifests and reads POB, rooms and the roster.
  if (!access.isAdmin && !access.isCampboss && !access.isOim && !access.isDispatcher) {
    return <p className="p-8 text-sm text-muted-foreground">Not authorized to view this report.</p>;
  }

  const m = await getManifestById(id);
  if (!m) {
    return <p className="p-8 text-sm text-muted-foreground">Manifest not found.</p>;
  }

  // Only the people who travel: no-shows are left off the manifest.
  const travelling = m.pax.filter((p) => !p.no_show);
  // Derived from the columns: the stored title contradicts the data on some rows.
  const desc = manifestDescriptor(m);

  const Cell = ({ label, value }: { label: string; value: string }) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-900">{value}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-6 print:bg-white print:p-0">
      <div className="mx-auto mb-3 flex max-w-[800px] justify-end gap-2 print:hidden">
        <a
          href={`/offshore-export?type=manifest&id=${m.id}`}
          className="inline-flex items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Download CSV
        </a>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-[800px] bg-white p-8 shadow-sm print:max-w-none print:shadow-none">
        {/* Header */}
        <ReportHeader
          title="Passenger manifest"
          subtitle="Offshore logistics"
          meta={[desc.movement, desc.transport, m.status.toUpperCase()]}
        />

        {/* Meta */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 py-4 sm:grid-cols-3">
          <Cell label="Movement" value={desc.summary} />
          <Cell label="Direction" value={desc.movementLong} />
          <Cell label="Route" value={desc.route} />
          <Cell label="Transport" value={desc.transport} />
          <Cell label="Scheduled date" value={m.scheduled_date} />
          <Cell label="Installation" value={m.installation_name ?? "—"} />
          <Cell label="Crew" value={m.crew_name ?? "—"} />
          <Cell label="Seats" value={String(m.seat_capacity)} />
          <Cell label="Travelling" value={String(travelling.length)} />
        </div>

        {/* Passenger table */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-600">
              <th className="w-8 px-2 py-1.5 font-semibold">#</th>
              <th className="px-2 py-1.5 font-semibold">Name</th>
              <th className="px-2 py-1.5 font-semibold">Position</th>
              <th className="px-2 py-1.5 font-semibold">Status</th>
              <th className="px-2 py-1.5 font-semibold">Remarks</th>
              <th className="w-24 px-2 py-1.5 font-semibold">Checked</th>
              <th className="w-40 px-2 py-1.5 font-semibold">Signature</th>
            </tr>
          </thead>
          <tbody>
            {travelling.map((p, i) => (
              <tr key={p.id} className="border-b border-gray-200">
                <td className="px-2 py-1.5 tabular-nums text-gray-500">{i + 1}</td>
                <td className="px-2 py-1.5 font-medium text-gray-900">{p.person_name}</td>
                <td className="px-2 py-1.5 text-gray-700">{p.position ?? "—"}</td>
                <td className="px-2 py-1.5 text-gray-700">{p.boarded ? "Boarded" : "Booked"}</td>
                <td className="px-2 py-1.5 text-gray-700">{p.issues.length ? p.issues.join(", ") : ""}</td>
                {/* Ticked and signed at the helideck / jetty on the day. */}
                <td className="border-l border-gray-200 px-2 py-1.5" />
                <td className="border-l border-gray-200 px-2 py-1.5" />
              </tr>
            ))}
            {travelling.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-gray-400">No passengers.</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Signatures */}
        <div className="mt-10 grid grid-cols-2 gap-8 text-xs text-gray-600 sm:grid-cols-4 print:grid-cols-4">
          {["Prepared by — Offshore Dispatcher", "Approved by — OIM", "Helicopter / Marine officer", "Date & time"].map((s) => (
            <div key={s}>
              <div className="h-10 border-b border-gray-400" />
              <div className="mt-1">{s}</div>
            </div>
          ))}
        </div>

        <ReportStampFooter label="Passenger manifest" />
      </div>
    </div>
  );
}
