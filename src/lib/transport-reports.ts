import "server-only";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/row-helpers";
import { dayRangeIso } from "@/lib/transport/day-plan";
import {
  approvalReport,
  driverReport,
  overviewReport,
  peakReport,
  requesterReport,
  routeReport,
  shuttleReport,
  type ApprovalReport,
  type DepartmentLine,
  type DriverLine,
  type OverviewReport,
  type PeakReport,
  type ReportRow,
  type RequesterLine,
  type RouteLine,
  type ShuttleLine,
  type VehicleLine,
  vehicleReport,
} from "@/lib/transport/reports";

export interface TransportReports {
  from: string;
  to: string;
  overview: OverviewReport;
  drivers: DriverLine[];
  vehicles: VehicleLine[];
  requesters: RequesterLine[];
  departments: DepartmentLine[];
  routes: RouteLine[];
  peaks: PeakReport;
  shuttles: ShuttleLine[];
  approvals: ApprovalReport;
}

/**
 * Every transportation report for a period, from one fetch of the requests
 * departing in it (site-clock days) plus the shuttles and their seats.
 * RLS scopes rows to the tenant; the desk and admins see everything.
 */
export async function getTransportReports(from: string, to: string, opts: { onTimeMinutes?: number } = {}): Promise<TransportReports> {
  const supabase = createClient();
  const { from: fromIso } = dayRangeIso(from);
  const { to: toIso } = dayRangeIso(to);
  const [{ data: reqs }, { data: shuttles }, { data: seats }] = await Promise.all([
    supabase
      .from("transport_requests")
      .select(
        "id, status, task_type, priority, created_at, depart_at, started_at, arrived_at, completed_at, approved_at, pickup, dropoff, passengers," +
          " odometer_start, odometer_end, fuel_litres, fuel_cost, rating, shuttle_id, shuttle_date, return_of," +
          " requester:profiles!transport_requests_requester_id_fkey(full_name, department)," +
          " driver:transport_drivers(full_name), vehicle:transport_vehicles(name)",
      )
      .gte("depart_at", fromIso)
      .lt("depart_at", toIso)
      .limit(5000),
    supabase.from("transport_shuttles").select("id, name, pickup, dropoff, passengers"),
    supabase.from("transport_shuttle_seats").select("shuttle_id, ride_date").is("cancelled_at", null).gte("ride_date", from).lte("ride_date", to),
  ]);

  const rows: ReportRow[] = ((reqs ?? []) as unknown as Record<string, any>[]).map((r) => {
    const requester = one<{ full_name?: string; department?: string }>(r.requester);
    return {
      id: r.id as string,
      status: r.status as string,
      task_type: r.task_type as string,
      priority: (r.priority as string) ?? "normal",
      created_at: r.created_at as string,
      depart_at: r.depart_at as string,
      started_at: (r.started_at as string) ?? null,
      arrived_at: (r.arrived_at as string) ?? null,
      completed_at: (r.completed_at as string) ?? null,
      approved_at: (r.approved_at as string) ?? null,
      pickup: r.pickup as string,
      dropoff: r.dropoff as string,
      passengers: Number(r.passengers ?? 1),
      requester_name: requester?.full_name ?? null,
      department: requester?.department ?? null,
      driver_name: one<{ full_name?: string }>(r.driver)?.full_name ?? null,
      vehicle_name: one<{ name?: string }>(r.vehicle)?.name ?? null,
      odometer_start: (r.odometer_start as number) ?? null,
      odometer_end: (r.odometer_end as number) ?? null,
      fuel_litres: r.fuel_litres == null ? null : Number(r.fuel_litres),
      fuel_cost: r.fuel_cost == null ? null : Number(r.fuel_cost),
      rating: (r.rating as number) ?? null,
      shuttle_id: (r.shuttle_id as string) ?? null,
      shuttle_date: (r.shuttle_date as string) ?? null,
      return_of: (r.return_of as string) ?? null,
    };
  });
  const onTime = opts.onTimeMinutes ?? 15;
  const req = requesterReport(rows);
  return {
    from,
    to,
    overview: overviewReport(rows, from, to, { onTimeMinutes: onTime }),
    drivers: driverReport(rows, onTime),
    vehicles: vehicleReport(rows),
    requesters: req.byPerson,
    departments: req.byDepartment,
    routes: routeReport(rows),
    peaks: peakReport(rows),
    shuttles: shuttleReport((shuttles ?? []) as { id: string; name: string; pickup: string; dropoff: string; passengers: number }[], rows, (seats ?? []) as { shuttle_id: string; ride_date: string }[]),
    approvals: approvalReport(rows),
  };
}
