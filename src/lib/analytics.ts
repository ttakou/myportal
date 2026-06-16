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
