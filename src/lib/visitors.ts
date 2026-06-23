import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/canteen";
import type { Visitor } from "@/types/visitors";

const SELECT =
  "id, full_name, company, purpose, visit_date, status, badge_no, vehicle_type, vehicle_plate, service, check_in_at, check_out_at, accompanying_infants, accompanying_children, accompanying_adolescents, host:profiles!visitors_host_id_fkey(full_name)";

function mapRow(row: Record<string, unknown>): Visitor {
  const host = Array.isArray(row.host) ? row.host[0] : row.host;
  return {
    id: row.id as string,
    full_name: row.full_name as string,
    company: (row.company as string) ?? null,
    purpose: (row.purpose as string) ?? null,
    visit_date: row.visit_date as string,
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

/** Visitors for a given visit date (RLS-scoped). */
export async function getVisitors(visitDate: string): Promise<Visitor[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("visitors")
    .select(SELECT)
    .eq("visit_date", visitDate)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("getVisitors:", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

/**
 * Everyone currently on site for a given day — the emergency muster list.
 * Defaults to today; the muster is a live, daily roster. Earlier days remain
 * available as historical visitor records via {@link getVisitors}.
 */
export async function getOnSite(visitDate: string = today()): Promise<Visitor[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("visitors")
    .select(SELECT)
    .eq("status", "checked_in")
    .eq("visit_date", visitDate)
    .order("check_in_at", { ascending: true });
  if (error) {
    console.error("getOnSite:", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}
