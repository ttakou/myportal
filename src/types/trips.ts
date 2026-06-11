export type TripStatus =
  | "draft"
  | "submitted"
  | "manager_approved"
  | "finance_approved"
  | "rejected"
  | "completed";

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  draft: "Draft",
  submitted: "Awaiting supervisor",
  manager_approved: "Approved",
  finance_approved: "Finance approved",
  rejected: "Rejected",
  completed: "Completed",
};

// --- Travel safety -----------------------------------------------------------

export type TravelType =
  | "business"
  | "field_mission"
  | "training"
  | "leave"
  | "personal"
  | "emergency";

export const TRAVEL_TYPE_LABEL: Record<TravelType, string> = {
  business: "Business trip",
  field_mission: "Field mission",
  training: "Training",
  leave: "Leave travel",
  personal: "Personal travel",
  emergency: "Emergency travel",
};

/** Travel types that need supervisor approval before departure. */
export const APPROVAL_TRAVEL_TYPES: TravelType[] = [
  "business",
  "field_mission",
  "training",
];

export type TripPhase = "declared" | "departed" | "arrived" | "returned";

export const TRIP_PHASE_LABEL: Record<TripPhase, string> = {
  declared: "Declared",
  departed: "Departed",
  arrived: "Arrived safely",
  returned: "Returned",
};

export type TripCheckinKind = "departed" | "arrived" | "safe" | "returned" | "help";

export const CHECKIN_KIND_LABEL: Record<TripCheckinKind, string> = {
  departed: "Departed",
  arrived: "Arrived safely",
  safe: "Confirmed safe",
  returned: "Returned",
  help: "Requested help",
};

export interface TripCheckin {
  id: string;
  kind: TripCheckinKind;
  note: string | null;
  created_at: string;
}

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
  // Travel safety
  travel_type: TravelType;
  transport_mode: string | null;
  route: string | null;
  accommodation: string | null;
  contact_number: string | null;
  dest_emergency_contact: string | null;
  phase: TripPhase;
  departed_at: string | null;
  arrived_at: string | null;
  returned_at: string | null;
  last_checkin_at: string | null;
  checkins: TripCheckin[];
  // Expenses (legacy reconciliation)
  expenses: TripExpense[];
  expense_total: number;
}

export type ContactCategory = "hospital" | "police" | "embassy" | "company" | "other";

export const CONTACT_CATEGORY_LABEL: Record<ContactCategory, string> = {
  hospital: "Hospital",
  police: "Police",
  embassy: "Embassy",
  company: "Company",
  other: "Other",
};

export interface EmergencyContact {
  id: string;
  destination: string;
  category: ContactCategory;
  name: string;
  phone: string | null;
  note: string | null;
}

/** A trip flagged for the travel-safety dashboard. */
export interface TravelDashboard {
  away: Trip[]; // departed/arrived, not yet returned
  departingToday: Trip[]; // approved & departing today, not yet departed
  returningToday: Trip[]; // expected back today, not yet returned
  overdue: Trip[]; // past return date, not returned
  needsHelp: Trip[]; // latest check-in is a help request
}
