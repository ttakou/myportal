import { createClient } from "@/lib/supabase/server";
import type { Trip } from "@/types/trips";

const SELECT =
  "id, destination, purpose, depart_date, return_date, estimated_cost, status, rejection_reason," +
  " requester:profiles!out_of_town_trips_requester_id_fkey(full_name)," +
  " trip_expenses(id, category, amount, note)";

function mapTrip(row: Record<string, any>): Trip {
  const requester = Array.isArray(row.requester) ? row.requester[0] : row.requester;
  const expenses = (row.trip_expenses ?? []).map((e: Record<string, any>) => ({
    id: e.id,
    category: e.category,
    amount: Number(e.amount),
    note: e.note,
  }));
  return {
    id: row.id,
    requester_name: requester?.full_name ?? null,
    destination: row.destination,
    purpose: row.purpose,
    depart_date: row.depart_date,
    return_date: row.return_date,
    estimated_cost: Number(row.estimated_cost),
    status: row.status,
    rejection_reason: row.rejection_reason,
    expenses,
    expense_total: expenses.reduce((s: number, e: { amount: number }) => s + e.amount, 0),
  };
}

export async function getMyTrips(): Promise<Trip[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("out_of_town_trips")
    .select(SELECT)
    .eq("requester_id", user.id)
    .order("depart_date", { ascending: false });
  if (error) {
    console.error("getMyTrips:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapTrip(r as Record<string, any>));
}

/** Trips awaiting the current user's approval (manager of report, or finance/admin). */
export async function getApprovalQueue(): Promise<Trip[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("out_of_town_trips")
    .select(SELECT)
    .neq("requester_id", user.id)
    .in("status", ["submitted", "manager_approved"])
    .order("depart_date", { ascending: true });
  if (error) {
    console.error("getApprovalQueue:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapTrip(r as Record<string, any>));
}
