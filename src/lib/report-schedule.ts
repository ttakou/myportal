import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { runReport, type ReportClient, type ReportResult } from "@/lib/report-run";
import {
  MEASURE_LABEL,
  type ChartType,
  type Dimension,
  type Measure,
  type ReportDefinition,
  type ReportFilter,
  type ReportSchedule,
} from "@/types/reporting";

/** Whether a schedule is due to run on `today` (UTC). Cron runs daily. */
function isDue(freq: ReportSchedule["frequency"], today: Date): boolean {
  const dow = today.getUTCDay();
  const dom = today.getUTCDate();
  const month = today.getUTCMonth();
  if (freq === "weekly") return dow === 1; // Monday
  if (freq === "monthly") return dom === 1; // 1st of month
  if (freq === "quarterly") return dom === 1 && month % 3 === 0; // Jan/Apr/Jul/Oct
  return false;
}

function toDefinition(r: Record<string, unknown>): ReportDefinition {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    description: (r.description as string | null) ?? null,
    dimensions: Array.isArray(r.dimensions) ? (r.dimensions as Dimension[]) : [],
    measures: Array.isArray(r.measures) ? (r.measures as Measure[]) : [],
    filters: Array.isArray(r.filters) ? (r.filters as ReportFilter[]) : [],
    chartType: (r.chart_type as ChartType) ?? "table",
    schedule: (r.schedule as ReportSchedule | null) ?? null,
    isWidget: !!r.is_widget,
    roleAccess: [],
  };
}

function buildHtml(name: string, result: ReportResult): string {
  const head = [result.dimensionLabel, "Headcount", ...result.measures.map((m: Measure) => MEASURE_LABEL[m])];
  const th = head.map((h) => `<th align="left" style="padding:4px 8px;border-bottom:1px solid #ccc">${h}</th>`).join("");
  const rows = result.rows
    .map((row) => {
      const cells = [row.group, String(row.headcount), ...result.measures.map((m) => row.values[m] ?? "—")];
      return `<tr>${cells.map((c) => `<td style="padding:4px 8px;border-bottom:1px solid #eee">${c}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<p>Scheduled report: <strong>${name}</strong></p><table style="border-collapse:collapse;font-family:sans-serif;font-size:13px"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** Email any report whose schedule is due today to its recipients. */
export async function runScheduledReports(): Promise<{ ok: boolean; sent: number; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, sent: 0, error: "Service-role key missing." };
  if (!isEmailConfigured()) return { ok: true, sent: 0 };

  const today = new Date();
  const { data } = await admin.from("report_definitions").select("*").not("schedule", "is", null);

  let sent = 0;
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const schedule = row.schedule as ReportSchedule | null;
    if (!schedule?.recipients?.length || !isDue(schedule.frequency, today)) continue;
    const def = toDefinition(row);
    const result = await runReport(def, {
      client: admin as unknown as ReportClient,
      tenantId: row.tenant_id as string,
    });
    const html = buildHtml(def.name, result);
    await Promise.all(
      schedule.recipients.map((to) => sendEmail({ to, subject: `Report: ${def.name}`, html })),
    );
    sent += 1;
  }
  return { ok: true, sent };
}
