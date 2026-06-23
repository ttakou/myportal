import { createClient } from "@/lib/supabase/server";

export interface ReportData {
  periodLabel: string;
  servedToday: number;
  booked: number; // committed reservations this period (excl. cancelled)
  collected: number;
  missed: number;
  cancelled: number;
  noShowRate: number; // missed / (collected + missed)
  wasteRate: number; // uncollected prepared / prepared
  avgFood: number | null;
  avgQty: number | null;
  feedbackCount: number;
  incidents: { type: string; count: number }[];
  byDept: { department: string; collected: number }[];
  costPerMeal: number;
  subsidyPerMeal: number;
  monthCost: number;
  monthSubsidy: number;
}

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export async function getReportData(): Promise<ReportData> {
  const supabase = createClient();
  const start = monthStart();
  const today = new Date().toISOString().slice(0, 10);
  const periodLabel = new Date(start + "T00:00:00").toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  // Cost settings from the canteen module config (defaults if unset).
  const { data: svc } = await supabase
    .from("tenant_services")
    .select("settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "canteen")
    .maybeSingle();
  const settings = (svc?.settings as Record<string, unknown>) ?? {};
  const costPerMeal = Number(settings.cost_per_meal ?? 6);
  const subsidyPerMeal = Number(settings.subsidy_per_meal ?? 4);

  // Lunch history for the period (admin sees all tenant rows via RLS). Counts
  // are in *covers* (plates), not bookings: a booking serves the host plus
  // however many visitor plates were actually collected, so a host + 2 guests
  // is 3 served covers. booked uses the declared guest_count (covers committed);
  // collected uses collected_guest_count (covers actually handed over); a missed
  // booking forfeits its whole declared cover.
  const { data: hist } = await supabase
    .from("canteen_lunch_history")
    .select("outcome, guest_count, collected_guest_count")
    .gte("service_date", start);
  const rows = (hist ?? []) as {
    outcome: string;
    guest_count: number | null;
    collected_guest_count: number | null;
  }[];

  let booked = 0, collected = 0, missed = 0, cancelled = 0, servedToday = 0;
  for (const r of rows) {
    const declared = 1 + (r.guest_count ?? 0);
    const served = 1 + (r.collected_guest_count ?? 0);
    if (r.outcome === "cancelled") cancelled++;
    else booked += declared;
    if (r.outcome === "collected") collected += served;
    if (r.outcome === "missed") missed += declared;
  }
  // served today (host plate + visitor plates collected today)
  const { data: todayRows } = await supabase
    .from("canteen_bookings")
    .select("collected_guest_count")
    .eq("service_date", today)
    .not("collected_at", "is", null);
  servedToday = (todayRows ?? []).reduce(
    (s, r) => s + 1 + ((r.collected_guest_count as number | null) ?? 0),
    0,
  );

  const prepared = collected + missed; // committed past covers
  const noShowRate = prepared > 0 ? Math.round((missed / prepared) * 100) : 0;
  const wasteRate = noShowRate; // uncollected prepared share (same basis here)

  // Department consumption (covers collected this period)
  const { data: deptRows } = await supabase
    .from("canteen_bookings")
    .select("collected_guest_count, department:profiles!canteen_bookings_profile_id_fkey(department)")
    .gte("service_date", start)
    .not("collected_at", "is", null);
  const deptMap = new Map<string, number>();
  for (const row of (deptRows ?? []) as Record<string, any>[]) {
    const dep = Array.isArray(row.department) ? row.department[0] : row.department;
    const name = dep?.department || "Unassigned";
    const covers = 1 + (Number(row.collected_guest_count) || 0);
    deptMap.set(name, (deptMap.get(name) ?? 0) + covers);
  }
  const byDept = [...deptMap.entries()]
    .map(([department, c]) => ({ department, collected: c }))
    .sort((a, b) => b.collected - a.collected);

  // Feedback / satisfaction
  const { data: fb } = await supabase
    .from("canteen_feedback")
    .select("food_quality, quantity_rating, issue_type")
    .gte("created_at", start);
  const fbRows = (fb ?? []) as {
    food_quality: number | null;
    quantity_rating: number | null;
    issue_type: string;
  }[];
  const foods = fbRows.map((f) => f.food_quality).filter((n): n is number => !!n);
  const qtys = fbRows.map((f) => f.quantity_rating).filter((n): n is number => !!n);
  const avg = (a: number[]) =>
    a.length ? Math.round((a.reduce((s, n) => s + n, 0) / a.length) * 10) / 10 : null;
  const incidentMap = new Map<string, number>();
  for (const f of fbRows) {
    if (f.issue_type && f.issue_type !== "none")
      incidentMap.set(f.issue_type, (incidentMap.get(f.issue_type) ?? 0) + 1);
  }

  return {
    periodLabel,
    servedToday,
    booked,
    collected,
    missed,
    cancelled,
    noShowRate,
    wasteRate,
    avgFood: avg(foods),
    avgQty: avg(qtys),
    feedbackCount: fbRows.length,
    incidents: [...incidentMap.entries()].map(([type, count]) => ({ type, count })),
    byDept,
    costPerMeal,
    subsidyPerMeal,
    monthCost: Math.round(collected * costPerMeal * 100) / 100,
    monthSubsidy: Math.round(collected * subsidyPerMeal * 100) / 100,
  };
}
