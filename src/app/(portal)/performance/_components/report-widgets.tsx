import Link from "next/link";
import { getReportDefinitions } from "@/lib/reporting";
import { runReport } from "@/lib/report-run";
import { MEASURE_LABEL } from "@/types/reporting";

/**
 * HR dashboard widgets: each report flagged "pin as widget" rendered as a
 * compact computed card. Renders nothing when there are no widget reports.
 */
export async function ReportWidgets() {
  const defs = (await getReportDefinitions()).filter((d) => d.isWidget);
  if (defs.length === 0) return null;

  const cards = await Promise.all(defs.map(async (def) => ({ def, result: await runReport(def) })));

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Dashboard</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ def, result }) => {
          const measure = result.measures[0];
          return (
            <Link
              key={def.id}
              href={`/performance/reports/${def.id}`}
              className="block rounded-lg border bg-card p-4 hover:bg-accent"
            >
              <p className="text-sm font-medium">{def.name}</p>
              <p className="text-xs text-muted-foreground">
                by {result.dimensionLabel}
                {measure ? ` · ${MEASURE_LABEL[measure]}` : ""}
              </p>
              <ul className="mt-2 space-y-1">
                {result.rows.slice(0, 4).map((r) => (
                  <li key={r.group} className="flex justify-between text-sm">
                    <span className="truncate text-muted-foreground">{r.group}</span>
                    <span className="font-medium">{measure ? r.values[measure] ?? "—" : r.headcount}</span>
                  </li>
                ))}
                {result.rows.length === 0 && <li className="text-xs text-muted-foreground">No data.</li>}
              </ul>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
