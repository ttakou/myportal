import { createClient } from "@/lib/supabase/server";

export interface ExecMetrics {
  pob: number;
  onboardStaff: number;
  visitorsOnboard: number;
  installations: { name: string; pob: number; capacity: number }[];
  activeCrews: number;
  certExpiring: number;
  pendingVisits: number;
  activeEmployees: number;
  transportRequests: number;
  canteenBookings: number;
}

/** Cross-module KPIs for the executive dashboard (all RLS-scoped to the tenant). */
export async function getExecMetrics(): Promise<ExecMetrics> {
  const supabase = createClient();
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const c = (n: number | null | undefined) => n ?? 0;

  const [pobRows, crews, certStaff, pendVisits, emp, transport, canteen, onboard, visOnboard] =
    await Promise.all([
      supabase.from("offshore_pob").select("name, pob, pob_capacity").order("name"),
      supabase.from("offshore_crews").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase
        .from("offshore_staff")
        .select("id", { count: "exact", head: true })
        .or(`medical_expiry.lte.${in30},bosiet_expiry.lte.${in30},huet_expiry.lte.${in30}`),
      supabase
        .from("offshore_visit_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "requested"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("transport_requests").select("id", { count: "exact", head: true }),
      supabase.from("canteen_bookings").select("id", { count: "exact", head: true }),
      supabase.from("offshore_trips").select("id", { count: "exact", head: true }).eq("status", "onboard"),
      supabase
        .from("offshore_visit_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "onboard"),
    ]);

  const installations = ((pobRows.data ?? []) as Record<string, any>[]).map((r) => ({
    name: r.name as string,
    pob: (r.pob as number) ?? 0,
    capacity: (r.pob_capacity as number) ?? 0,
  }));

  return {
    pob: c(onboard.count) + c(visOnboard.count),
    onboardStaff: c(onboard.count),
    visitorsOnboard: c(visOnboard.count),
    installations,
    activeCrews: c(crews.count),
    certExpiring: c(certStaff.count),
    pendingVisits: c(pendVisits.count),
    activeEmployees: c(emp.count),
    transportRequests: c(transport.count),
    canteenBookings: c(canteen.count),
  };
}

export interface PerformanceMetrics {
  cycle: { name: string; year: number; status: string } | null;
  total: number;
  completed: number;
  completionPct: number;
  pending: number;
  avgRating: number | null;
  distribution: { label: string; count: number }[];
  /** Recent cycles oldest→newest, for a year-over-year trend. */
  trend: { year: number; avgRating: number | null; completionPct: number }[];
}

const COMPLETED_STATUSES = new Set(["completed", "closed"]);
const RATING_BUCKETS = [
  { label: "1", min: 0, max: 1.5 },
  { label: "2", min: 1.5, max: 2.5 },
  { label: "3", min: 2.5, max: 3.5 },
  { label: "4", min: 3.5, max: 4.5 },
  { label: "5", min: 4.5, max: 5.01 },
];

function avg(xs: number[]): number | null {
  return xs.length ? Math.round((xs.reduce((s, n) => s + n, 0) / xs.length) * 100) / 100 : null;
}

/**
 * Appraisal KPIs for the executive dashboard: completion, average rating and
 * rating distribution for the active (or most recent) cycle, plus a
 * year-over-year trend across recent cycles. Admin-only page; RLS scopes rows
 * to the tenant.
 */
export async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
  const supabase = createClient();
  const [{ data: cycleRows }, { data: appraisalRows }] = await Promise.all([
    supabase
      .from("appraisal_cycles")
      .select("id, name, year, status")
      .order("year", { ascending: false }),
    supabase.from("appraisals").select("cycle_id, status, overall_rating"),
  ]);

  const cycles = (cycleRows ?? []) as { id: string; name: string; year: number; status: string }[];
  const appraisals = (appraisalRows ?? []) as {
    cycle_id: string;
    status: string;
    overall_rating: number | null;
  }[];

  // Aggregate per cycle once.
  const byCycle = new Map<string, { total: number; completed: number; ratings: number[] }>();
  for (const a of appraisals) {
    const g = byCycle.get(a.cycle_id) ?? { total: 0, completed: 0, ratings: [] };
    g.total += 1;
    if (COMPLETED_STATUSES.has(a.status)) g.completed += 1;
    if (a.overall_rating != null) g.ratings.push(Number(a.overall_rating));
    byCycle.set(a.cycle_id, g);
  }

  const headline = cycles.find((c) => c.status === "active") ?? cycles[0] ?? null;
  const hg = headline ? byCycle.get(headline.id) ?? { total: 0, completed: 0, ratings: [] } : null;

  const distribution = RATING_BUCKETS.map((b) => ({
    label: b.label,
    count: (hg?.ratings ?? []).filter((r) => r >= b.min && r < b.max).length,
  }));

  const trend = [...cycles]
    .slice(0, 5)
    .reverse()
    .map((c) => {
      const g = byCycle.get(c.id) ?? { total: 0, completed: 0, ratings: [] };
      return {
        year: c.year,
        avgRating: avg(g.ratings),
        completionPct: g.total ? Math.round((g.completed / g.total) * 100) : 0,
      };
    });

  const total = hg?.total ?? 0;
  const completed = hg?.completed ?? 0;
  return {
    cycle: headline ? { name: headline.name, year: headline.year, status: headline.status } : null,
    total,
    completed,
    completionPct: total ? Math.round((completed / total) * 100) : 0,
    pending: total - completed,
    avgRating: avg(hg?.ratings ?? []),
    distribution,
    trend,
  };
}

