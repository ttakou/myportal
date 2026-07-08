import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/canteen";
import type { Visitor, VisitorStatus } from "@/types/visitors";

const SELECT =
  "id, full_name, company, purpose, visit_date, visit_until, status, badge_no, vehicle_type, vehicle_plate, service, check_in_at, check_out_at, accompanying_infants, accompanying_children, accompanying_adolescents, host:profiles!visitors_host_id_fkey(full_name)";

function mapRow(row: Record<string, unknown>): Visitor {
  const host = Array.isArray(row.host) ? row.host[0] : row.host;
  return {
    id: row.id as string,
    full_name: row.full_name as string,
    company: (row.company as string) ?? null,
    purpose: (row.purpose as string) ?? null,
    visit_date: row.visit_date as string,
    visit_until: (row.visit_until as string) ?? null,
    status: row.status as Visitor["status"],
    badge_no: (row.badge_no as string) ?? null,
    vehicle_type: (row.vehicle_type as string) ?? null,
    vehicle_plate: (row.vehicle_plate as string) ?? null,
    host_name: (host as { full_name?: string })?.full_name ?? null,
    service: (row.service as string) ?? null,
    check_in_at: (row.check_in_at as string) ?? null,
    check_out_at: (row.check_out_at as string) ?? null,
    accompanying_infants: Number(row.accompanying_infants ?? 0),
    accompanying_children: Number(row.accompanying_children ?? 0),
    accompanying_adolescents: Number(row.accompanying_adolescents ?? 0),
  };
}

type Checkin = { check_in_at: string | null; check_out_at: string | null };

/**
 * Fold a pass's entry log into a single-day-style presentation: its latest
 * arrival/departure and a derived status. A pass is "on site" (checked_in) while
 * its most recent entry has no check-out; once every entry is closed it reads as
 * checked_out; with no entries yet it is still pre-registered. A cancelled pass
 * stays cancelled regardless of history.
 */
function applyPassPresence(v: Visitor, events: Checkin[]): Visitor {
  if (v.status === "cancelled") return v;
  if (events.length === 0) {
    return { ...v, status: "pre_registered", check_in_at: null, check_out_at: null };
  }
  // Events arrive ordered by check_in_at ascending; the last is the most recent.
  const latest = events[events.length - 1];
  const open = latest.check_out_at == null;
  const status: VisitorStatus = open ? "checked_in" : "checked_out";
  return {
    ...v,
    status,
    check_in_at: latest.check_in_at ?? null,
    check_out_at: open ? null : latest.check_out_at ?? null,
  };
}

/** Fetch and group each pass's entry log by visitor, ordered oldest→newest. */
async function loadPassEvents(
  supabase: ReturnType<typeof createClient>,
  passIds: string[],
): Promise<Map<string, Checkin[]>> {
  const byVisitor = new Map<string, Checkin[]>();
  if (passIds.length === 0) return byVisitor;
  const { data } = await supabase
    .from("visitor_checkins")
    .select("visitor_id, check_in_at, check_out_at")
    .in("visitor_id", passIds)
    .order("check_in_at", { ascending: true });
  for (const r of (data ?? []) as (Checkin & { visitor_id: string })[]) {
    const list = byVisitor.get(r.visitor_id) ?? [];
    list.push({ check_in_at: r.check_in_at, check_out_at: r.check_out_at });
    byVisitor.set(r.visitor_id, list);
  }
  return byVisitor;
}

/** Distinct, non-empty departments in use — for the "assign to a service" picker. */
export async function getDepartments(): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("department")
    .not("department", "is", null)
    .order("department", { ascending: true });
  if (error) return [];
  const seen = new Set<string>();
  for (const r of (data ?? []) as { department?: string | null }[]) {
    const d = (r.department ?? "").trim();
    if (d) seen.add(d);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * Visitors relevant to a given day (RLS-scoped): single-day visits on that date,
 * plus any long-stay pass whose [visit_date, visit_until] range covers it. For
 * passes the returned status/arrival/departure reflect the latest gate entry.
 */
export async function getVisitors(visitDate: string): Promise<Visitor[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("visitors")
    .select(SELECT)
    // Range starts on or before the day, AND either the pass covers the day
    // (visit_until >= day) or it is a single-day visit exactly on the day.
    .lte("visit_date", visitDate)
    .or(`visit_until.gte.${visitDate},and(visit_until.is.null,visit_date.eq.${visitDate})`)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("getVisitors:", error.message);
    return [];
  }
  const rows = (data ?? []).map(mapRow);
  const passIds = rows.filter((v) => v.visit_until).map((v) => v.id);
  const events = await loadPassEvents(supabase, passIds);
  return rows.map((v) => (v.visit_until ? applyPassPresence(v, events.get(v.id) ?? []) : v));
}

/**
 * Everyone currently on site — the emergency muster list. This is a union of
 * single-day visitors checked in on the given day and long-stay passes with an
 * open gate entry (which are present regardless of their start date). Defaults to
 * today; earlier days remain available as historical records via {@link getVisitors}.
 */
export async function getOnSite(visitDate: string = today()): Promise<Visitor[]> {
  const supabase = createClient();

  // Single-day visitors checked in on the day.
  const singleDay = supabase
    .from("visitors")
    .select(SELECT)
    .is("visit_until", null)
    .eq("status", "checked_in")
    .eq("visit_date", visitDate)
    .order("check_in_at", { ascending: true });

  // Long-stay passes with a currently-open entry.
  const openEntries = supabase
    .from("visitor_checkins")
    .select("visitor_id, check_in_at")
    .is("check_out_at", null)
    .order("check_in_at", { ascending: true });

  const [singleRes, openRes] = await Promise.all([singleDay, openEntries]);
  if (singleRes.error) {
    console.error("getOnSite:", singleRes.error.message);
  }
  const result: Visitor[] = (singleRes.data ?? []).map(mapRow);

  const openRows = (openRes.data ?? []) as { visitor_id: string; check_in_at: string | null }[];
  if (openRows.length > 0) {
    const arrivalById = new Map(openRows.map((r) => [r.visitor_id, r.check_in_at]));
    const { data: passRows } = await supabase
      .from("visitors")
      .select(SELECT)
      .in("id", [...arrivalById.keys()]);
    for (const row of (passRows ?? []) as Record<string, unknown>[]) {
      const v = mapRow(row);
      // Reflect the open entry's arrival time on the muster row.
      result.push({ ...v, status: "checked_in", check_in_at: arrivalById.get(v.id) ?? v.check_in_at, check_out_at: null });
    }
  }

  return result.sort((a, b) => (a.check_in_at ?? "").localeCompare(b.check_in_at ?? ""));
}
