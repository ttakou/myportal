import { createClient } from "@/lib/supabase/server";

/**
 * The Access Register — a unified entry/exit history of everyone who passed
 * the gate over a period: staff and contractors (staff_attendance), single-day
 * visitors (visitors) and long-stay passes (one row per visitor_checkins
 * entry). Feeds the printable register report at /visitors/register.
 */

export type AccessKind = "staff" | "contractor" | "visitor";

export type AccessEntry = {
  /** Calendar day of the entry (YYYY-MM-DD). */
  date: string;
  name: string;
  kind: AccessKind;
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
};

const KIND_OF_TYPE = (t: string | null): AccessKind =>
  t === "contractor" ? "contractor" : "staff";

function vehicleLabel(type: string | null, plate: string | null): string | null {
  return [type, plate].filter(Boolean).join(" · ") || null;
}

/** All gate entries for the period, RLS-scoped (security/admin audience). */
export async function getAccessRegister(f: AccessRegisterFilters): Promise<AccessRegister> {
  const supabase = createClient();
  const wantStaffSide = f.population === "all" || f.population === "staff" || f.population === "contractor";
  // A person filter targets a staff/contractor profile, so visitor rows are out.
  const wantVisitors = (f.population === "all" || f.population === "visitor") && !f.personId;
  const fromTs = `${f.from}T00:00:00Z`;
  const toTs = `${f.to}T23:59:59Z`;

  const staffQ = wantStaffSide
    ? supabase
        .from("staff_attendance")
        .select(
          "attendance_date, check_in_at, check_out_at, vehicle_type, vehicle_plate, profiles!staff_attendance_profile_id_fkey(id, full_name, department, job_title, employee_type)",
        )
        .gte("attendance_date", f.from)
        .lte("attendance_date", f.to)
        .not("check_in_at", "is", null)
        .order("attendance_date", { ascending: false })
    : Promise.resolve({ data: [] as Record<string, unknown>[] });

  // Single-day visitors that actually arrived in the period.
  const singleQ = wantVisitors
    ? supabase
        .from("visitors")
        .select(
          "full_name, company, purpose, service, visit_date, badge_no, vehicle_type, vehicle_plate, check_in_at, check_out_at, host:profiles!visitors_host_id_fkey(full_name)",
        )
        .is("visit_until", null)
        .gte("visit_date", f.from)
        .lte("visit_date", f.to)
        .not("check_in_at", "is", null)
    : Promise.resolve({ data: [] as Record<string, unknown>[] });

  // Long-stay passes: one register row per logged gate entry.
  const passQ = wantVisitors
    ? supabase
        .from("visitor_checkins")
        .select(
          "check_in_at, check_out_at, badge_no, visitors!inner(full_name, company, purpose, service, vehicle_type, vehicle_plate, host:profiles!visitors_host_id_fkey(full_name))",
        )
        .gte("check_in_at", fromTs)
        .lte("check_in_at", toTs)
    : Promise.resolve({ data: [] as Record<string, unknown>[] });

  const [staffRes, singleRes, passRes] = await Promise.all([staffQ, singleQ, passQ]);

  const entries: AccessEntry[] = [];

  for (const r of (staffRes.data ?? []) as Record<string, unknown>[]) {
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
    if (f.personId && p.id !== f.personId) continue;
    if (f.department && (p.department ?? "") !== f.department) continue;
    entries.push({
      date: r.attendance_date as string,
      name: p.full_name ?? "—",
      kind,
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

  const visitorRow = (v: Record<string, unknown>, entry: {
    date: string;
    badge: string | null;
    check_in_at: string | null;
    check_out_at: string | null;
  }): AccessEntry | null => {
    // Visitors carry a service (department they visit); the department filter
    // applies to it so "everyone who accessed for dept X" includes its visitors.
    if (f.department && ((v.service as string) ?? "") !== f.department) return null;
    const host = Array.isArray(v.host) ? v.host[0] : v.host;
    const hostName = (host as { full_name?: string })?.full_name ?? null;
    return {
      date: entry.date,
      name: (v.full_name as string) ?? "—",
      kind: "visitor",
      org: (v.company as string) ?? null,
      detail: [hostName && `Host: ${hostName}`, v.purpose as string]
        .filter(Boolean)
        .join(" · ") || null,
      badge: entry.badge,
      vehicle: vehicleLabel((v.vehicle_type as string) ?? null, (v.vehicle_plate as string) ?? null),
      check_in_at: entry.check_in_at,
      check_out_at: entry.check_out_at,
    };
  };

  for (const v of (singleRes.data ?? []) as Record<string, unknown>[]) {
    const row = visitorRow(v, {
      date: v.visit_date as string,
      badge: (v.badge_no as string) ?? null,
      check_in_at: (v.check_in_at as string) ?? null,
      check_out_at: (v.check_out_at as string) ?? null,
    });
    if (row) entries.push(row);
  }

  for (const c of (passRes.data ?? []) as Record<string, unknown>[]) {
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
      b.date.localeCompare(a.date) ||
      (b.check_in_at ?? "").localeCompare(a.check_in_at ?? ""),
  );

  const people = new Set(entries.map((e) => `${e.kind}:${e.name}`));
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
  };
}
