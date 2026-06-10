export type TripStatus =
  | "draft"
  | "submitted"
  | "manager_approved"
  | "finance_approved"
  | "rejected"
  | "completed";

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  manager_approved: "Manager approved",
  finance_approved: "Finance approved",
  rejected: "Rejected",
  completed: "Completed",
};

export interface TripExpense {
  id: string;
  category: string;
  amount: number;
  note: string | null;
}

export interface Trip {
  id: string;
  requester_name: string | null;
  destination: string;
  purpose: string | null;
  depart_date: string;
  return_date: string | null;
  estimated_cost: number;
  status: TripStatus;
  rejection_reason: string | null;
  expenses: TripExpense[];
  expense_total: number;
}
