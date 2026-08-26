import { NextResponse } from "next/server";
import { getAccess } from "@/lib/auth";
import { getStatusReport } from "@/lib/performance/status-report";
import { progressSheetRows } from "@/lib/performance/stage-progress";
import { buildXlsx, fileSlug } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

/**
 * The status report as a real Excel workbook — one row per participant, one
 * column per stage, days late as a number so it sorts.
 */
export async function GET(request: Request) {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const cycleId = new URL(request.url).searchParams.get("cycle");
  const report = await getStatusReport(cycleId);
  const rows = progressSheetRows(report.rows);

  const summary: (string | number | null)[][] = [
    ["Measure", "Count"],
    ["Participants", report.summary.participants],
    ["Complete", report.summary.finished],
    ["In progress", report.summary.inProgress],
    ["Not started", report.summary.notStarted],
    ["Running late", report.summary.overdue],
  ];

  const book = buildXlsx([
    { name: "Status", rows },
    { name: "Summary", rows: summary },
  ]);

  const name = `status-report-${fileSlug(report.selectedCycleName ?? "cycle")}-${report.generatedAt}.xlsx`;
  // Uint8Array copied into a fresh ArrayBuffer so the body is a plain BlobPart.
  return new NextResponse(new Blob([new Uint8Array(book)]), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
