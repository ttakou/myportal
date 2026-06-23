import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  DIMENSION_LABEL,
  MEASURE_LABEL,
  type Dimension,
  type Measure,
  type ReportDefinition,
} from "@/types/reporting";

/** Measures we can currently compute from appraisal + profile data. */
export const SUPPORTED_MEASURES: Measure[] = [
  "completion_rate",
  "average_rating",
  "overdue_assessments",
  "rating_distribution",
  "rating_changes_after_calibration",
];
/** Dimensions backed by real columns today. */
export const SUPPORTED_DIMENSIONS: Dimension[] = ["cycle", "department", "position", "manager"];

const COMPLETED = new Set(["closed", "completed"]);

export interface ReportResult {
  dimension: Dimension | null;
  dimensionLabel: string;
  measures: Measure[];
  unsupportedMeasures: Measure[];
  unsupportedDimension: Dimension | null;
  rows: { group: string; headcount: number; values: Record<string, string> }[];
}

function embedField(embed: unknown, key: string): string | null {
  const o = Array.isArray(embed) ? embed[0] : embed;
  return (o as Record<string, string> | null)?.[key] ?? null;
}

/** Execute a saved report definition against the data (HR-scoped via RLS). */
export type ReportClient = ReturnType<typeof createClient>;

export async function runReport(
  def: ReportDefinition,
  opts: { client?: ReportClient; tenantId?: string } = {},
): Promise<ReportResult> {
  const supabase = opts.client ?? createClient();
  const tenantId = opts.tenantId;
  const dim = def.dimensions[0] ?? null; // single-dimension grouping for now
  const unsupportedDimension = dim && !SUPPORTED_DIMENSIONS.includes(dim) ? dim : null;
  const measures = def.measures.filter((m) => SUPPORTED_MEASURES.includes(m));
  const unsupportedMeasures = def.measures.filter((m) => !SUPPORTED_MEASURES.includes(m));

  // When run with an admin client (cron), scope explicitly by tenant since RLS
  // is bypassed.
  let cyclesQ = supabase.from("appraisal_cycles").select("id, name");
  if (tenantId) cyclesQ = cyclesQ.eq("tenant_id", tenantId);
  let apsQ = supabase
    .from("appraisals")
    .select(
      "id, cycle_id, manager_id, status, overall_rating, final_score, rating_label, employee:profiles!employee_id(department, job_title)",
    );
  if (tenantId) apsQ = apsQ.eq("tenant_id", tenantId);

  // Appraisals adjusted during calibration (for the rating-changes measure).
  let adjQ = supabase.from("appraisal_calibration_adjustments").select("appraisal_id");
  if (tenantId) adjQ = adjQ.eq("tenant_id", tenantId);
  const needChanges = measures.includes("rating_changes_after_calibration");

  const [{ data: cyclesRes }, { data: aps }, adjRes] = await Promise.all([
    cyclesQ,
    apsQ,
    needChanges ? adjQ : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const changedSet = new Set(
    ((adjRes.data ?? []) as Record<string, unknown>[]).map((r) => String(r.appraisal_id)),
  );

  const cycleName = new Map(((cyclesRes ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), String(c.name ?? "")]));

  // Resolve manager names if grouping/filtering by manager.
  let managerName = new Map<string, string>();
  if (dim === "manager") {
    const ids = [...new Set(((aps ?? []) as Record<string, unknown>[]).map((a) => a.manager_id as string).filter(Boolean))];
    if (ids.length) {
      const { data: mgrs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      managerName = new Map(((mgrs ?? []) as Record<string, unknown>[]).map((m) => [String(m.id), String(m.full_name ?? "")]));
    }
  }

  const groupValue = (a: Record<string, unknown>): string => {
    switch (dim) {
      case "cycle":
        return cycleName.get(String(a.cycle_id)) || "—";
      case "department":
        return embedField(a.employee, "department") || "—";
      case "position":
        return embedField(a.employee, "job_title") || "—";
      case "manager":
        return managerName.get(String(a.manager_id)) || "—";
      default:
        return "All";
    }
  };

  // Apply filters (only those on supported dimensions are evaluated).
  const dimValue = (a: Record<string, unknown>, d: Dimension): string => {
    switch (d) {
      case "cycle":
        return cycleName.get(String(a.cycle_id)) || "";
      case "department":
        return embedField(a.employee, "department") || "";
      case "position":
        return embedField(a.employee, "job_title") || "";
      default:
        return "";
    }
  };
  const rowsData = ((aps ?? []) as Record<string, unknown>[]).filter((a) =>
    def.filters.every((f) => {
      if (!SUPPORTED_DIMENSIONS.includes(f.dimension)) return true;
      return dimValue(a, f.dimension).toLowerCase() === f.value.trim().toLowerCase();
    }),
  );

  // Aggregate per group.
  type Acc = {
    total: number;
    completed: number;
    overdue: number;
    ratings: number[];
    bands: Record<string, number>;
    changed: number;
  };
  const groups = new Map<string, Acc>();
  for (const a of rowsData) {
    const g = groupValue(a);
    const acc = groups.get(g) ?? { total: 0, completed: 0, overdue: 0, ratings: [], bands: {}, changed: 0 };
    acc.total += 1;
    if (COMPLETED.has(String(a.status))) acc.completed += 1;
    if (a.status === "overdue") acc.overdue += 1;
    const r = (a.overall_rating ?? a.final_score) as number | null;
    if (r != null) acc.ratings.push(Number(r));
    const lbl = a.rating_label as string | null;
    if (lbl) acc.bands[lbl] = (acc.bands[lbl] ?? 0) + 1;
    if (changedSet.has(String(a.id))) acc.changed += 1;
    groups.set(g, acc);
  }

  const rows = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([group, acc]) => {
      const values: Record<string, string> = {};
      for (const m of measures) {
        if (m === "completion_rate")
          values[m] = acc.total ? `${Math.round((acc.completed / acc.total) * 100)}%` : "—";
        else if (m === "average_rating")
          values[m] = acc.ratings.length
            ? String(Math.round((acc.ratings.reduce((x, y) => x + y, 0) / acc.ratings.length) * 10) / 10)
            : "—";
        else if (m === "overdue_assessments") values[m] = String(acc.overdue);
        else if (m === "rating_distribution") {
          const parts = Object.entries(acc.bands)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([label, n]) => `${label}: ${n}`);
          values[m] = parts.length ? parts.join(" · ") : "—";
        } else if (m === "rating_changes_after_calibration")
          values[m] = acc.total ? `${acc.changed} (${Math.round((acc.changed / acc.total) * 100)}%)` : "—";
      }
      return { group, headcount: acc.total, values };
    });

  return {
    dimension: dim,
    dimensionLabel: dim ? DIMENSION_LABEL[dim] : "All",
    measures,
    unsupportedMeasures,
    unsupportedDimension,
    rows,
  };
}

export { MEASURE_LABEL };
