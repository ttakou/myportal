import { getAccess } from "@/lib/auth";
import { getTenantBranding } from "@/lib/branding";
import { getMusterDrill } from "@/lib/offshore";
import { PrintButton } from "../../offshore-manifest/[id]/print-button";

/** Printable muster roll-call (after-action) report with tenant branding. */
export default async function MusterReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getAccess();
  if (!access.isAdmin && !access.isSafetyAdmin && !access.isOim) {
    return <p className="p-8 text-sm text-muted-foreground">Not authorized to view this report.</p>;
  }
  const [drill, branding] = await Promise.all([getMusterDrill(id), getTenantBranding()]);
  if (!drill) return <p className="p-8 text-sm text-muted-foreground">Roll-call not found.</p>;

  const groups = new Map<string, typeof drill.checkins>();
  for (const c of drill.checkins) {
    const g = c.lifeboat || "Unassigned";
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  const total = drill.checkins.length;
  const accounted = drill.checkins.filter((c) => c.accounted).length;
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC" : "—");

  return (
    <div className="bg-gray-100 p-6 print:bg-white print:p-0">
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } } .mr,.mr * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }`}</style>
      <div className="mx-auto mb-3 flex max-w-[800px] items-center gap-2 print:hidden">
        <PrintButton />
        <a href={`/offshore-export?type=muster&id=${drill.id}`} className="inline-flex items-center rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">Download CSV</a>
      </div>

      <div className="mr mx-auto max-w-[800px] bg-white p-6 shadow-sm print:max-w-none print:shadow-none">
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-3">
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.name} className="h-12 w-auto object-contain" />
            ) : null}
            <div className="text-lg font-bold text-gray-900">{branding.name}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold tracking-tight text-gray-900">
              MUSTER ROLL-CALL{drill.kind === "real" ? " — EMERGENCY" : " — DRILL"}
            </div>
            <div className="text-xs text-gray-500">
              {accounted}/{total} accounted · started {fmt(drill.started_at)}
              {drill.ended_at ? ` · ended ${fmt(drill.ended_at)}` : " · OPEN"}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {[...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([g, people]) => {
            const acc = people.filter((p) => p.accounted).length;
            return (
              <div key={g} className="rounded border border-gray-200 p-2 text-[12px]" style={{ breakInside: "avoid" }}>
                <div className="mb-1 flex items-center justify-between font-semibold text-gray-900">
                  <span>Muster {g}</span>
                  <span className={acc < people.length ? "text-red-600" : "text-green-700"}>{acc}/{people.length}</span>
                </div>
                <ul className="space-y-0.5">
                  {people.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span>{p.name}</span>
                      <span className={p.accounted ? "text-green-700" : "font-semibold text-red-600"}>
                        {p.accounted ? "✓" : "UNACCOUNTED"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-6 border-t border-gray-200 pt-2 text-[9px] text-gray-400">
          {branding.name} · Muster roll-call · Generated {new Date().toLocaleString("en-GB", { timeZone: "UTC" })} UTC
        </div>
      </div>
    </div>
  );
}
