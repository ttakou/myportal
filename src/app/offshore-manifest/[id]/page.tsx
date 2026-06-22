import { getAccess } from "@/lib/auth";
import { getTenantBranding } from "@/lib/branding";
import { getManifestById } from "@/lib/offshore";
import { TRIP_TYPE_LABEL } from "@/types/offshore";
import { PrintButton } from "./print-button";

/** Standalone, print-friendly passenger manifest report with tenant branding. */
export default async function ManifestReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getAccess();
  if (!access.isAdmin && !access.isCampboss && !access.isOim) {
    return <p className="p-8 text-sm text-muted-foreground">Not authorized to view this report.</p>;
  }

  const [m, branding] = await Promise.all([getManifestById(id), getTenantBranding()]);
  if (!m) {
    return <p className="p-8 text-sm text-muted-foreground">Manifest not found.</p>;
  }

  const travelling = m.pax.filter((p) => !p.no_show);
  const noShow = m.pax.filter((p) => p.no_show);
  const directionLabel = m.direction === "out" ? "Inbound — joining installation" : "Outbound — leaving installation";
  const mode = (m.transport_mode ?? "—").replace(/^\w/, (c) => c.toUpperCase());
  const generated = new Date().toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC";

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
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4">
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.name} className="h-14 w-auto object-contain" />
            ) : null}
            <div>
              <div className="text-lg font-bold text-gray-900">{branding.name}</div>
              <div className="text-xs text-gray-500">Offshore logistics</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold tracking-tight text-gray-900">PASSENGER MANIFEST</div>
            <div className="text-xs text-gray-500">{TRIP_TYPE_LABEL[m.trip_type] ?? m.trip_type}</div>
            <div className="mt-1 inline-block rounded bg-gray-900 px-2 py-0.5 text-[11px] font-medium uppercase text-white">
              {m.status}
            </div>
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 py-4 sm:grid-cols-3">
          <Cell label="Movement" value={m.title} />
          <Cell label="Direction" value={directionLabel} />
          <Cell label="Transport" value={mode} />
          <Cell label="Scheduled date" value={m.scheduled_date} />
          <Cell label="Installation" value={m.installation_name ?? "—"} />
          <Cell label="Crew" value={m.crew_name ?? "—"} />
          <Cell label="Seats" value={String(m.seat_capacity)} />
          <Cell label="Travelling" value={String(travelling.length)} />
          <Cell label="No-show" value={String(noShow.length)} />
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
              </tr>
            ))}
            {noShow.map((p, i) => (
              <tr key={p.id} className="border-b border-gray-200 text-gray-400 line-through">
                <td className="px-2 py-1.5 tabular-nums">{travelling.length + i + 1}</td>
                <td className="px-2 py-1.5">{p.person_name}</td>
                <td className="px-2 py-1.5">{p.position ?? "—"}</td>
                <td className="px-2 py-1.5">No-show</td>
                <td className="px-2 py-1.5">{p.issues.length ? p.issues.join(", ") : ""}</td>
              </tr>
            ))}
            {m.pax.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-gray-400">No passengers.</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Signatures */}
        <div className="mt-10 grid grid-cols-3 gap-8 text-xs text-gray-600">
          {["Prepared by", "Helicopter / Marine officer", "Date & time"].map((s) => (
            <div key={s}>
              <div className="h-10 border-b border-gray-400" />
              <div className="mt-1">{s}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 border-t border-gray-200 pt-2 text-[10px] text-gray-400">
          {branding.name} · Passenger manifest · Generated {generated}
        </div>
      </div>
    </div>
  );
}
