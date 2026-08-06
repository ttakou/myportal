import { getAccess } from "@/lib/auth";
import { getMealSheet, getAllInstallations } from "@/lib/offshore";
import { mealSheetLabel } from "@/lib/offshore/meal-sheet-label";
import { MEAL_LABEL } from "@/types/offshore";
import { ReportHeader, ReportStampFooter } from "@/components/ui/report-letterhead";
import { PrintButton } from "../offshore-manifest/[id]/print-button";

/**
 * Standalone, print-friendly daily meal sheet — "Meal sheet of <date>".
 *
 * The entries themselves have always been saved per installation and date; what
 * was missing was a labelled document to review, sign or file, which every other
 * offshore report already had.
 */
export default async function MealSheetReportPage({
  searchParams,
}: {
  searchParams: Promise<{ installation?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const access = await getAccess();
  if (!access.isAdmin && !access.isCampboss && !access.isOim && !access.isCanteenManager) {
    return <p className="p-8 text-sm text-muted-foreground">Not authorized to view this report.</p>;
  }

  const date = sp.date || new Date().toISOString().slice(0, 10);
  const installations = await getAllInstallations();
  const installationId = sp.installation || installations[0]?.id || "";
  const installation = installations.find((i) => i.id === installationId) ?? null;
  const entries = installationId ? await getMealSheet(installationId, date) : [];

  const label = mealSheetLabel(date, installation?.name ?? null);
  const count = (key: "breakfast" | "snack" | "lunch" | "dinner" | "lodging") =>
    entries.filter((e) => e[key]).length;
  const tick = (on: boolean) => (on ? "✓" : "—");

  return (
    <div className="bg-gray-100 p-6 print:bg-white print:p-0">
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>

      <div className="mx-auto mb-3 flex max-w-[900px] items-center gap-2 print:hidden">
        <PrintButton />
        <a
          href={`/offshore-export?type=meals&installation=${installationId}&date=${date}`}
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Download CSV
        </a>
      </div>

      <div className="mx-auto max-w-[900px] bg-white p-8 shadow-sm print:max-w-none print:shadow-none">
        <ReportHeader
          title={label.title}
          subtitle={label.subtitle}
          meta={[`${entries.length} person(s)`, `Lodging ${count("lodging")}`]}
        />

        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No meal sheet has been generated for this installation and date.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-2 py-4 text-center">
              {(["breakfast", "snack", "lunch", "dinner", "lodging"] as const).map((k) => (
                <div key={k} className="rounded border border-gray-200 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">{MEAL_LABEL[k]}</p>
                  <p className="text-lg font-semibold tabular-nums">{count(k)}</p>
                </div>
              ))}
            </div>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-gray-300 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-600">
                  <th className="w-8 px-2 py-1.5 font-semibold">#</th>
                  <th className="px-2 py-1.5 font-semibold">Name</th>
                  <th className="px-2 py-1.5 font-semibold">Category</th>
                  {(["breakfast", "snack", "lunch", "dinner", "lodging"] as const).map((k) => (
                    <th key={k} className="px-2 py-1.5 text-center font-semibold">
                      {MEAL_LABEL[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id} className="border-b border-gray-200">
                    <td className="px-2 py-1.5 tabular-nums text-gray-500">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium">{e.person_name}</td>
                    <td className="px-2 py-1.5 capitalize text-gray-600">{e.category}</td>
                    {(["breakfast", "snack", "lunch", "dinner", "lodging"] as const).map((k) => (
                      <td key={k} className="px-2 py-1.5 text-center">
                        {tick(e[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <ReportStampFooter />
      </div>
    </div>
  );
}
