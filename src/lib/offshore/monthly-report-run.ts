import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMonthlyReport, type MonthlyReport, type ReportMeal, type ReportTrip, type ReportVisit } from "./monthly-report";
import { offshoreDefaultInstallation } from "./day-manifest-run";
import { MOVE_KIND_LABEL, type MoveKind } from "./movement-change";
import { one } from "./_shared";
import type { RotationCycle } from "./rotation-math";

/**
 * Loads one month for the monthly report, with the service role, scoped to the
 * tenant by hand. Every list is read in pages: a month of meal sheets runs to
 * thousands of rows, past the database's 1,000-row reply.
 */

type Row = Record<string, any>;

async function all(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

export interface LateChange {
  person: string;
  what: string;
  decided: string;
  kind: "date change" | "cancelled late";
}

export interface MonthlyReportData extends MonthlyReport {
  lateChanges: LateChange[];
}

export async function getMonthlyReport(
  admin: SupabaseClient,
  tenantId: string,
  month: string,
  today: string,
): Promise<MonthlyReportData> {
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const [tripRows, visitRows, staffRows, mealRows, { data: insts }, { data: crews }, defaultInst, moveRows, cancelled] =
    await Promise.all([
      all((a, b) =>
        admin
          .from("offshore_trips")
          .select("profile_id, person_name, crew_id, installation_id, status, mobilize_date, demob_date, person:profiles!offshore_trips_profile_id_fkey(full_name, email)")
          .eq("tenant_id", tenantId)
          .in("status", ["onboard", "demobilised"])
          .lte("mobilize_date", end)
          .or(`demob_date.is.null,demob_date.gte.${start}`)
          .order("id")
          .range(a, b),
      ),
      all((a, b) =>
        admin
          .from("offshore_visit_requests")
          .select("visitor_name, visitor_company, installation_id, status, depart_date, return_date")
          .eq("tenant_id", tenantId)
          .in("status", ["onboard", "returned"])
          .lte("depart_date", end)
          .or(`return_date.is.null,return_date.gte.${start}`)
          .order("id")
          .range(a, b),
      ),
      all((a, b) =>
        admin
          .from("offshore_staff")
          .select("profile_id, company, profile:profiles!offshore_staff_profile_id_fkey(full_name, email)")
          .eq("tenant_id", tenantId)
          .order("profile_id")
          .range(a, b),
      ),
      all((a, b) =>
        admin
          .from("offshore_meal_entries")
          .select("meal_date, person_name, category, breakfast, snack, lunch, dinner, lodging")
          .eq("tenant_id", tenantId)
          .gte("meal_date", start)
          .lte("meal_date", end)
          .order("id")
          .range(a, b),
      ),
      admin.from("offshore_installations").select("id, name, pob_capacity, is_active").eq("tenant_id", tenantId),
      admin.from("offshore_crews").select("id, offshore_days, onshore_days, cycle_start_date").eq("tenant_id", tenantId),
      offshoreDefaultInstallation(admin, tenantId),
      all((a, b) =>
        admin
          .from("offshore_movement_requests")
          .select("profile_id, kind, scheduled_date, requested_date, decided_at, person:profiles!offshore_movement_requests_profile_id_fkey(full_name, email)")
          .eq("tenant_id", tenantId)
          .eq("status", "approved")
          .gte("decided_at", `${start}T00:00:00Z`)
          .lte("decided_at", `${end}T23:59:59Z`)
          .order("decided_at")
          .range(a, b),
      ),
      all((a, b) =>
        admin
          .from("offshore_trips")
          .select("person_name, mobilize_date, cancelled_at, person:profiles!offshore_trips_profile_id_fkey(full_name, email)")
          .eq("tenant_id", tenantId)
          .eq("status", "cancelled")
          .gte("cancelled_at", `${start}T00:00:00Z`)
          .lte("cancelled_at", `${end}T23:59:59Z`)
          .order("cancelled_at")
          .range(a, b),
      ),
    ]);

  const nameOf = (p: unknown, fallback?: string | null) => {
    const r = one<{ full_name?: string | null; email?: string | null }>(p as never);
    return r?.full_name || r?.email || fallback || "—";
  };
  const companyOf = new Map<string, string | null>();
  const companyByName = new Map<string, string | null>();
  for (const s of staffRows) {
    companyOf.set(String(s.profile_id), (s.company as string | null) ?? null);
    companyByName.set(nameOf(s.profile).trim().toLowerCase(), (s.company as string | null) ?? null);
  }

  const trips: ReportTrip[] = tripRows.map((t) => ({
    person: nameOf(t.person, t.person_name),
    company: t.profile_id ? companyOf.get(String(t.profile_id)) ?? null : null,
    crew_id: (t.crew_id as string | null) ?? null,
    installation_id: (t.installation_id as string | null) ?? null,
    status: String(t.status),
    mobilize_date: String(t.mobilize_date),
    demob_date: (t.demob_date as string | null) ?? null,
  }));
  const visits: ReportVisit[] = visitRows.map((v) => {
    companyByName.set(String(v.visitor_name).trim().toLowerCase(), (v.visitor_company as string | null) ?? null);
    return {
      person: String(v.visitor_name),
      company: (v.visitor_company as string | null) ?? null,
      installation_id: (v.installation_id as string | null) ?? null,
      status: String(v.status),
      depart_date: String(v.depart_date),
      return_date: (v.return_date as string | null) ?? null,
    };
  });
  const cycles = new Map<string, RotationCycle>(
    ((crews ?? []) as Row[]).map((c) => [
      String(c.id),
      {
        offshore_days: Number(c.offshore_days ?? 0),
        onshore_days: Number(c.onshore_days ?? 0),
        cycle_start_date: (c.cycle_start_date as string | null) ?? null,
      },
    ]),
  );

  const report = buildMonthlyReport({
    month,
    today,
    trips,
    visits,
    installations: ((insts ?? []) as Row[])
      .filter((i) => i.is_active !== false)
      .map((i) => ({ id: String(i.id), name: String(i.name), capacity: Number(i.pob_capacity ?? 0) })),
    defaultInstallationId: defaultInst,
    cycles,
    meals: mealRows as unknown as ReportMeal[],
    companyByName,
  });

  // Late changes: date changes approved this month, and trips cancelled within
  // two days of their mobilise date.
  const lateChanges: LateChange[] = [
    ...moveRows.map((r) => ({
      person: nameOf(r.person),
      what: `${MOVE_KIND_LABEL[r.kind as MoveKind] ?? r.kind}: ${r.scheduled_date ?? "no demob date"} → ${r.requested_date}`,
      decided: String(r.decided_at).slice(0, 10),
      kind: "date change" as const,
    })),
    ...cancelled
      .filter((t) => {
        const c = String(t.cancelled_at).slice(0, 10);
        const gap = (Date.parse(String(t.mobilize_date)) - Date.parse(c)) / 86_400_000;
        return gap <= 2;
      })
      .map((t) => ({
        person: nameOf(t.person, t.person_name),
        what: `Trip cancelled — was to mobilise ${t.mobilize_date}`,
        decided: String(t.cancelled_at).slice(0, 10),
        kind: "cancelled late" as const,
      })),
  ].sort((a, b) => a.decided.localeCompare(b.decided));

  return { ...report, lateChanges };
}
