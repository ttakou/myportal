import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dayRangeIso, localDate } from "@/lib/transport/day-plan";
import {
  buildAssignmentGrid,
  COUNTED_STATUSES,
  monthBounds,
  type AssignmentGrid,
  type LiveTask,
  type RecordedRow,
  type SheetDriver,
} from "@/lib/transport/daily-assignments";

const PAGE = 1000;

/** Every row of a query, a page at a time (PostgREST caps a response). */
async function allRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) {
      console.error("daily assignments:", error.message);
      break;
    }
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * One month of the daily assignments sheet: the drivers, what the desk
 * recorded for the month, and the driver tasks dispatched in the portal.
 * RLS limits it to the desk and finance.
 */
export async function getAssignmentMonth(month: string): Promise<AssignmentGrid> {
  const supabase = createClient();
  const { first, last } = monthBounds(month);
  const { from } = dayRangeIso(first);
  const { to } = dayRangeIso(last);

  const [{ data: drivers }, recorded, tasks] = await Promise.all([
    supabase.from("transport_drivers").select("id, full_name, is_active, sort_order"),
    allRows<RecordedRow>((a, b) =>
      supabase
        .from("transport_daily_assignments")
        .select("day, driver_id, assignments, source")
        .gte("day", first)
        .lte("day", last)
        .order("day")
        .order("driver_id")
        .range(a, b),
    ),
    allRows<LiveTask>((a, b) =>
      supabase
        .from("transport_requests")
        .select("depart_at, driver_id, status")
        .not("driver_id", "is", null)
        .in("status", [...COUNTED_STATUSES])
        .gte("depart_at", from)
        .lt("depart_at", to)
        .order("depart_at")
        .range(a, b),
    ),
  ]);

  const sheetDrivers: SheetDriver[] = ((drivers ?? []) as { id: string; full_name: string; is_active: boolean; sort_order: number | null }[]).map((d) => ({
    id: d.id,
    name: d.full_name,
    active: d.is_active,
    sort_order: d.sort_order ?? null,
  }));

  return buildAssignmentGrid({
    month,
    today: localDate(new Date().toISOString()),
    drivers: sheetDrivers,
    recorded,
    tasks,
  });
}
