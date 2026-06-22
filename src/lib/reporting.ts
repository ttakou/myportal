import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  AccessRole,
  ChartType,
  Dimension,
  Measure,
  ReportDefinition,
  ReportFilter,
  ReportSchedule,
} from "@/types/reporting";

function fromRow(r: Record<string, unknown>): ReportDefinition {
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
    roleAccess: Array.isArray(r.role_access) ? (r.role_access as AccessRole[]) : ["hr"],
  };
}

export async function getReportDefinitions(): Promise<ReportDefinition[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("report_definitions")
    .select("*")
    .order("created_at", { ascending: false });
  return ((data ?? []) as Record<string, unknown>[]).map(fromRow);
}

export async function getReportDefinition(id: string): Promise<ReportDefinition | null> {
  const supabase = createClient();
  const { data } = await supabase.from("report_definitions").select("*").eq("id", id).maybeSingle();
  return data ? fromRow(data as Record<string, unknown>) : null;
}
