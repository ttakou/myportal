import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * The Access Register — a unified entry/exit history of everyone who passed
 * the gate over a period: staff and contractors (staff_attendance), single-day
 * visitors (visitors) and long-stay passes (one row per visitor_checkins
 * entry). Feeds the printable register at /visitors/register and the monthly
 * scheduled email (which passes a service-role client + explicit tenantId).
 */

export type AccessKind = "staff" | "contractor" | "visitor";

export type AccessEntry = {
  /** Calendar day of the entry (YYYY-MM-DD). */
  date: string;
  name: string;
  kind: AccessKind;
  /** Staff/contractor profile id — powers the per-person drill-down. */
  personId: string | null;
  /** Department (staff/contractor) or company (visitor). */
  org: string | null;
  /** Job title (staff) or host · purpose (visitor). */
  detail: string | null;
  badge: string | null;
  vehicle: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
};

export type AccessRegisterFilters = {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
  population: "all" | "staff" | "contractor" | "visitor";
  department?: string | null;
  /** Restrict to one staff/contractor profile (visitors have no profile). */
  personId?: string | null;
  /** Restrict to one visitor by exact name — the visitor drill-down. */
  visitorName?: string | null;
};

export type AccessAnomaly = {
  type: "after_hours" | "no_exit" | "overstay";
  name: string;
  kind: AccessKind;
  date: string;
  detail: string;
};

export type AccessRegister = {
  entries: AccessEntry[];
  summary: {
    total: number;
    staff: number;
    contractors: number;
    visitors: number;
    /** Entries without a recorded exit (still on site, or exit never logged). */
    openExits: number;
    distinctPeople: number;
  };
  /** Entries per day, split by population — feeds the daily traffic chart. */
  dailyCounts: { date: string; staff: number; contractor: number; visitor: number }[];
  anomalies: AccessAnomaly[];
  /** True when a source hit the fetch cap — the on-screen period is incomplete. */
  truncated: boolean;
};

/** Site working window (UTC): entries outside it are flagged as after-hours. */
const WORK_START_H = 6; // 06:00 UTC
const WORK_END_H = 20; // 20:00 UTC
/** Threshold for "entered but no exit ever logged". */
const NO_EXIT_HOURS = 24;
/** Per-source fetch cap: 1000-row pages, at most 5 pages. */
const PAGE = 1000;
const MAX_PAGES = 5;

const KIND_OF_TYPE = (t: string | null): AccessKind =>
  t === "contractor" ? "contractor" : "staff";

function vehicleLabel(type: string | null, plate: string | null): string | null {
  return [type, plate].filter(Boolean).join(" · ") || null;
}

type Rows = Record<string, unknown>[];

/**
 * Drain a PostgREST query in 1000-row pages (the server silently caps a single
 * request at 1000 rows, which would truncate long periods). `build` must apply
 * a deterministic order so pages don't overlap.
 */
async function fetchAll(
  build: (fromIdx: number, toIdx: number) => PromiseLike<{ data: unknown }>,
): Promise<{ rows: Rows; truncated: boolean }> {
  const rows: Rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await build(page * PAGE, (page + 1) * PAGE - 1);
    const chunk = (data ?? []) as Rows;
    rows.push(...chunk);
    if (chunk.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** All gate entries for the period, RLS-scoped (security/admin audience). */
export async function getAccessRegister(
  f: AccessRegisterFilters,
  opts?: { client?: SupabaseClient; tenantId?: string },
): Promise<AccessRegister> {
  const supabase = opts?.client ?? createClient();
  // A service-role client bypasses RLS, so it must scope the tenant explicitly.
  const tenantId = opts?.tenantId ?? null;

  const wantStaffSide =
    (f.population === "all" || f.population === "staff" || f.population === "contractor") &&
    !f.visitorName;
  // A person filter targets a staff/contractor profile, so visitor rows are out.
  const wantVisitors = (f.population === "all" || f.population === "visitor") && !f.personId;
  const fromTs = `${f.from}T00:00:00Z`;
  const toTs = `${f.to}T23:59:59Z`;

  const staffP = wantStaffSide
    ? fetchAll((a, b) => {
        let q = supabase
          .from("staff_attendance")
          .select(
            "attendance_date, check_in_at, check_out_at, vehicle_type, vehicle_plate, profiles!staff_attendance_profile_id_fkey(id, full_name, department, job_title, employee_type)",
          )
          .gte("attendance_date", f.from)
          .lte("attendance_date", f.to)
          .not("check_in_at", "is", null);
        if (tenantId) q = q.eq("tenant_id", tenantId);
        if (f.personId) q = q.eq("profile_id", f.personId);
        return q
          .order("attendance_date", { ascending: false })
          .order("profile_id", { ascending: true })
          .range(a, b);
      })
    : Promise.resolve({ rows: [] as Rows, truncated: false });

  // Single-day visitors that actually arrived in the period.
  const singleP = wantVisitors
    ? fetchAll((a, b) => {
        let q = supabase
          .from("visitors")
          .select(
            "full_name, company, purpose, service, visit_date, badge_no, vehicle_type, vehicle_plate, check_in_at, check_out_at, host:profiles!visitors_host_id_fkey(full_name)",
          )
          .is("visit_until", null)
          .gte("visit_date", f.from)
          .lte("visit_date", f.to)
          .not("check_in_at", "is", null);
        if (tenantId) q = q.eq("tenant_id", tenantId);
        if (f.visitorName) q = q.eq("full_name", f.visitorName);
        return q
          .order("visit_date", { ascending: false })
          .order("id", { ascending: true })
          .range(a, b);
      })
    : Promise.resolve({ rows: [] as Rows, truncated: false });

  // Long-stay passes: one register row per logged gate entry.
  const passP = wantVisitors
    ? fetchAll((a, b) => {
        let q = supabase
          .from("visitor_checkins")
          .select(
            "check_in_at, check_out_at, badge_no, visitors!inner(full_name, company, purpose, service, vehicle_type, vehicle_plate, host:profiles!visitors_host_id_fkey(full_name))",
          )
          .gte("check_in_at", fromTs)
          .lte("check_in_at", toTs);
        if (tenantId) q = q.eq("tenant_id", tenantId);
        if (f.visitorName) q = q.eq("visitors.full_name", f.visitorName);
        return q.order("check_in_at", { ascending: false }).range(a, b);
      })
    : Promise.resolve({ rows: [] as Rows, truncated: false });

  // Overstayed passes: an entry still open on a pass whose validity has ended.
  // Register-wide (not period-bound): an overstay is live until resolved.
  const today = new Date().toISOString().slice(0, 10);
  const overstayP = wantVisitors
    ? (() => {
        let q = supabase
          .from("visitor_checkins")
          .select("check_in_at, visitors!inner(full_name, company, visit_until)")
          .is("check_out_at", null)
          .lt("visitors.visit_until", today);
        if (tenantId) q = q.eq("tenant_id", tenantId);
        return q.limit(100);
      })()
    : Promise.resolve({ data: [] as Rows });

  const [staffRes, singleRes, passRes, overstayRes] = await Promise.all([
    staffP,
    singleP,
    passP,
    overstayP,
  ]);

  const entries: AccessEntry[] = [];

  for (const r of staffRes.rows) {
    const pr = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const p = pr as {
      id?: string;
      full_name?: string;
      department?: string | null;
      job_title?: string | null;
      employee_type?: string | null;
    } | null;
    if (!p) continue;
    const kind = KIND_OF_TYPE(p.employee_type ?? null);
    if (f.population === "staff" && kind !== "staff") continue;
    if (f.population === "contractor" && kind !== "contractor") continue;
    if (f.department && (p.department ?? "") !== f.department) continue;
    entries.push({
      date: r.attendance_date as string,
      name: p.full_name ?? "—",
      kind,
      personId: p.id ?? null,
      org: p.department ?? null,
      detail: p.job_title ?? null,
      badge: null,
      vehicle: vehicleLabel(
        (r.vehicle_type as string) ?? null,
        (r.vehicle_plate as string) ?? null,
      ),
      check_in_at: (r.check_in_at as string) ?? null,
      check_out_at: (r.check_out_at as string) ?? null,
    });
  }

  const visitorRow = (
    v: Record<string, unknown>,
    entry: {
      date: string;
      badge: string | null;
      check_in_at: string | null;
      check_out_at: string | null;
    },
  ): AccessEntry | null => {
    // Visitors carry a service (department they visit); the department filter
    // applies to it so "everyone who accessed for dept X" includes its visitors.
    if (f.department && ((v.service as string) ?? "") !== f.department) return null;
    const host = Array.isArray(v.host) ? v.host[0] : v.host;
    const hostName = (host as { full_name?: string })?.full_name ?? null;
    return {
      date: entry.date,
      name: (v.full_name as string) ?? "—",
      kind: "visitor",
      personId: null,
      org: (v.company as string) ?? null,
      detail:
        [hostName && `Host: ${hostName}`, v.purpose as string].filter(Boolean).join(" · ") ||
        null,
      badge: entry.badge,
      vehicle: vehicleLabel((v.vehicle_type as string) ?? null, (v.vehicle_plate as string) ?? null),
      check_in_at: entry.check_in_at,
      check_out_at: entry.check_out_at,
    };
  };

  for (const v of singleRes.rows) {
    const row = visitorRow(v, {
      date: v.visit_date as string,
      badge: (v.badge_no as string) ?? null,
      check_in_at: (v.check_in_at as string) ?? null,
      check_out_at: (v.check_out_at as string) ?? null,
    });
    if (row) entries.push(row);
  }

  for (const c of passRes.rows) {
    const v = (Array.isArray(c.visitors) ? c.visitors[0] : c.visitors) as
      | Record<string, unknown>
      | null;
    if (!v) continue;
    const checkIn = (c.check_in_at as string) ?? null;
    const row = visitorRow(v, {
      date: checkIn ? checkIn.slice(0, 10) : f.from,
      badge: (c.badge_no as string) ?? null,
      check_in_at: checkIn,
      check_out_at: (c.check_out_at as string) ?? null,
    });
    if (row) entries.push(row);
  }

  entries.sort(
    (a, b) =>
      b.date.localeCompare(a.date) || (b.check_in_at ?? "").localeCompare(a.check_in_at ?? ""),
  );

  // ---- Daily traffic (chronological, gaps filled with zero-days) ------------
  const byDay = new Map<string, { staff: number; contractor: number; visitor: number }>();
  for (const e of entries) {
    const d = byDay.get(e.date) ?? { staff: 0, contractor: 0, visitor: 0 };
    d[e.kind] += 1;
    byDay.set(e.date, d);
  }
  const dailyCounts: AccessRegister["dailyCounts"] = [];
  for (let t = new Date(`${f.from}T00:00:00Z`); ; t.setUTCDate(t.getUTCDate() + 1)) {
    const day = t.toISOString().slice(0, 10);
    if (day > f.to) break;
    dailyCounts.push({ date: day, ...(byDay.get(day) ?? { staff: 0, contractor: 0, visitor: 0 }) });
    if (dailyCounts.length > 400) break; // hard stop for absurd ranges
  }

  // ---- Anomalies ------------------------------------------------------------
  const anomalies: AccessAnomaly[] = [];
  const nowMs = Date.now();
  for (const e of entries) {
    if (e.check_in_at) {
      const h = new Date(e.check_in_at).getUTCHours();
      if (h < WORK_START_H || h >= WORK_END_H) {
        anomalies.push({
          type: "after_hours",
          name: e.name,
          kind: e.kind,
          date: e.date,
          detail: `Entered at ${e.check_in_at.slice(11, 16)} UTC (outside ${String(
            WORK_START_H,
          ).padStart(2, "0")}:00–${WORK_END_H}:00)`,
        });
      }
    }
    if (
      e.check_in_at &&
      !e.check_out_at &&
      nowMs - +new Date(e.check_in_at) > NO_EXIT_HOURS * 3600_000
    ) {
      anomalies.push({
        type: "no_exit",
        name: e.name,
        kind: e.kind,
        date: e.date,
        detail: `Entry on ${e.date} has no exit logged after ${NO_EXIT_HOURS}h`,
      });
    }
  }
  for (const r of ((overstayRes as { data: unknown }).data ?? []) as Rows) {
    const v = (Array.isArray(r.visitors) ? r.visitors[0] : r.visitors) as
      | { full_name?: string; company?: string | null; visit_until?: string | null }
      | null;
    if (!v) continue;
    anomalies.push({
      type: "overstay",
      name: v.full_name ?? "—",
      kind: "visitor",
      date: ((r.check_in_at as string) ?? "").slice(0, 10),
      detail: `Still on site — pass expired ${v.visit_until ?? "?"}${v.company ? ` (${v.company})` : ""}`,
    });
  }
  anomalies.sort((a, b) => b.date.localeCompare(a.date));

  const people = new Set(entries.map((e) => e.personId ?? `${e.kind}:${e.name}`));
  return {
    entries,
    summary: {
      total: entries.length,
      staff: entries.filter((e) => e.kind === "staff").length,
      contractors: entries.filter((e) => e.kind === "contractor").length,
      visitors: entries.filter((e) => e.kind === "visitor").length,
      openExits: entries.filter((e) => e.check_in_at && !e.check_out_at).length,
      distinctPeople: people.size,
    },
    dailyCounts,
    anomalies,
    truncated: staffRes.truncated || singleRes.truncated || passRes.truncated,
  };
}
