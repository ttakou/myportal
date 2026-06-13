export type OffshoreStatus =
  | "requested"
  | "hse_cleared"
  | "manifested"
  | "onboard"
  | "demobilised"
  | "cancelled";

export const OFFSHORE_STATUS_LABEL: Record<OffshoreStatus, string> = {
  requested: "Requested",
  hse_cleared: "HSE cleared",
  manifested: "Manifested",
  onboard: "On board",
  demobilised: "Demobilised",
  cancelled: "Cancelled",
};

export interface Installation {
  id: string;
  name: string;
  pob_capacity: number;
  is_active?: boolean;
}

export interface Flight {
  id: string;
  flight_date: string;
  route: string;
  seats: number;
}

export interface Pob {
  installation_id: string;
  name: string;
  pob_capacity: number;
  pob: number;
}

export interface OffshoreTrip {
  id: string;
  person_name: string | null;
  installation_id: string | null;
  installation_name: string | null;
  mobilize_date: string;
  demob_date: string | null;
  status: OffshoreStatus;
  hse_cleared_at: string | null;
  flight_id: string | null;
  flight_label: string | null;
  bed_no: string | null;
}

// --- Crew change, roster & accommodation (Phase 1) ---------------------------

export interface Crew {
  id: string;
  name: string;
  installation_id: string | null;
  installation_name: string | null;
  rotation_pattern: string | null;
  offshore_days: number;
  onshore_days: number;
  transport_mode: string | null;
  departure_location: string | null;
  color: string | null;
  is_active: boolean;
  member_count: number;
  cycle_start_date: string | null;
  /** Next date this crew goes offshore, derived from the cycle (or null). */
  next_change_date: string | null;
}

/** A tenant employee with their current crew assignment (for the crew builder). */
export interface AssignableEmployee {
  id: string; // profile id
  name: string;
  crew_id: string | null;
  crew_name: string | null;
}

/** A schedule-driven prompt to board or offboard a crew. */
export interface CrewChangeSuggestion {
  crew_id: string;
  crew_name: string;
  action: "mobilise" | "demobilise";
  since: string; // window start date the change was due
  count: number; // people to move
}

export type RotationDay = "offshore" | "onshore" | "change_out" | "change_in";

export interface RotationCalendar {
  days: string[]; // ISO dates spanning the window
  crews: {
    id: string;
    name: string;
    offshore_days: number;
    onshore_days: number;
    member_count: number;
    /** Per-day status aligned with `days`; null when no cycle anchor set. */
    statuses: (RotationDay | null)[];
    members: string[];
  }[];
}

export type RoomStatus =
  | "available"
  | "occupied"
  | "reserved"
  | "blocked"
  | "maintenance"
  | "cleaning";

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  available: "Available",
  occupied: "Occupied",
  reserved: "Reserved",
  blocked: "Blocked",
  maintenance: "Under maintenance",
  cleaning: "Cleaning",
};

export type GenderRestriction = "any" | "male" | "female";

export const GENDER_LABEL: Record<GenderRestriction, string> = {
  any: "Any",
  male: "Male only",
  female: "Female only",
};

export interface Room {
  id: string;
  installation_id: string;
  installation_name: string | null;
  block: string | null;
  floor: string | null;
  room_number: string;
  room_type: string;
  bed_count: number;
  max_bed_count: number;
  gender_restriction: GenderRestriction;
  status: RoomStatus;
  special_flag: string | null;
  notes: string | null;
  fixed_assigned: number;
  /** People currently on board in this room (live). */
  occupied: number;
  occupants: { name: string; bed_no: string | null }[];
}

export interface RosterEntry {
  id: string;
  profile_id: string;
  full_name: string | null;
  email: string;
  crew_id: string | null;
  crew_name: string | null;
  position: string | null;
  company: string | null;
  back_to_back_id: string | null;
  back_to_back_name: string | null;
  fixed_room_id: string | null;
  fixed_room_label: string | null;
  fixed_bed: string | null;
  /** Muster / lifeboat station (LB-1, LB-2, …). */
  lifeboat: string | null;
  medical_expiry: string | null;
  bosiet_expiry: string | null;
  huet_expiry: string | null;
  emergency_contact: string | null;
  travel_eligible: boolean;
}

export interface PobBreakdown {
  total: number;
  byInstallation: { name: string; pob: number; capacity: number }[];
  byCrew: { name: string; pob: number }[];
  /** On-board headcount per lifeboat / muster station (LB-1, LB-2, …). */
  byLifeboat: { name: string; pob: number }[];
  byCategory: { staff: number; visitor: number };
  arrivalsToday: number;
  departuresToday: number;
  overstayers: { name: string; installation: string | null; demob_date: string | null }[];
  /** Every person currently on board, for drill-down lists. */
  people: PobOnboard[];
}

/** A single on-board person, used for dashboard drill-downs. */
export interface PobOnboard {
  trip_id: string;
  profile_id: string | null;
  name: string;
  crew_id: string | null;
  crew_name: string | null;
  lifeboat: string | null;
  room_id: string | null;
  room_label: string | null;
  bed_no: string | null;
  company: string | null;
}

export interface AccommodationSummary {
  totalRooms: number;
  totalBeds: number;
  fixedBeds: number;
  occupiedBeds: number;
  blockedRooms: number;
  availableBeds: number;
  /** Rooms whose current occupancy exceeds bed_count (day/night hot-bunking). */
  sharedRooms: number;
  /** The hot-bunked rooms with their occupants, for drill-down + fixing. */
  overbooked: {
    room_id: string;
    label: string;
    beds: number;
    occupants: { trip_id: string; name: string; bed_no: string | null }[];
  }[];
}

export interface CertAlert {
  full_name: string | null;
  kind: "medical" | "bosiet" | "huet";
  expiry: string;
  expired: boolean;
}

// --- Visitor requests & accommodation allocation (Phase 2) -------------------

export type VisitStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "onboard"
  | "returned"
  | "cancelled";

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  onboard: "On board",
  returned: "Returned",
  cancelled: "Cancelled",
};

export type VisitorType =
  | "employee"
  | "contractor"
  | "vendor"
  | "auditor"
  | "regulator"
  | "client"
  | "management";

export const VISITOR_TYPE_LABEL: Record<VisitorType, string> = {
  employee: "Employee",
  contractor: "Contractor",
  vendor: "Vendor",
  auditor: "Auditor",
  regulator: "Regulator",
  client: "Client",
  management: "Management",
};

export interface BedAllocation {
  id: string;
  room_id: string;
  room_label: string | null;
  from_date: string;
  to_date: string;
  status: "reserved" | "checked_in" | "checked_out";
}

export interface VisitRequest {
  id: string;
  requester_name: string | null;
  visitor_name: string;
  visitor_company: string | null;
  visitor_type: VisitorType;
  gender: GenderRestriction;
  host_department: string | null;
  host_name: string | null;
  purpose: string | null;
  installation_id: string | null;
  installation_name: string | null;
  depart_date: string;
  return_date: string | null;
  overnight: boolean;
  accommodation_required: boolean;
  emergency_contact: string | null;
  status: VisitStatus;
  reject_reason: string | null;
  allocation: BedAllocation | null;
}

/** A room with computed free beds for a requested date range. */
export interface RoomAvailability {
  room_id: string;
  label: string;
  room_type: string;
  gender_restriction: GenderRestriction;
  free_beds: number;
}

// --- Trip manifests (Phase 3) ------------------------------------------------

export type ManifestStatus = "draft" | "approved" | "locked" | "completed" | "cancelled";

export const MANIFEST_STATUS_LABEL: Record<ManifestStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  locked: "Locked",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TRIP_TYPE_LABEL: Record<string, string> = {
  crew_change_out: "Crew change · outbound",
  crew_change_in: "Crew change · inbound",
  visitor_out: "Visitor · outbound",
  visitor_in: "Visitor · inbound",
  medevac: "Medical evacuation",
  adhoc: "Ad-hoc movement",
};

export interface ManifestPax {
  id: string;
  profile_id: string | null;
  person_name: string;
  position: string | null;
  boarded: boolean;
  no_show: boolean;
  /** Live eligibility issues (expired cert / not eligible), computed on read. */
  issues: string[];
}

export interface Manifest {
  id: string;
  title: string;
  crew_id: string | null;
  crew_name: string | null;
  installation_id: string | null;
  installation_name: string | null;
  trip_type: string;
  direction: "out" | "in";
  transport_mode: string | null;
  seat_capacity: number;
  scheduled_date: string;
  status: ManifestStatus;
  pax: ManifestPax[];
}

// --- Catering / Daily Meal Sheet ---------------------------------------------

export type MealKind = "breakfast" | "snack" | "lunch" | "dinner" | "lodging";

export const MEAL_LABEL: Record<MealKind, string> = {
  breakfast: "Breakfast",
  snack: "Snack",
  lunch: "Lunch",
  dinner: "Dinner",
  lodging: "Lodging",
};

export const MEAL_TIME: Partial<Record<MealKind, string>> = {
  breakfast: "05:00",
  snack: "09:00",
  lunch: "11:30",
  dinner: "17:30",
};

export interface MealEntry {
  id: string;
  person_name: string;
  category: "staff" | "visitor" | "casual";
  breakfast: boolean;
  snack: boolean;
  lunch: boolean;
  dinner: boolean;
  lodging: boolean;
}

// --- History (POB as-of + room occupancy) ------------------------------------

export interface PobPerson {
  name: string;
  category: "staff" | "visitor";
  installation: string | null;
  crew: string | null;
  lifeboat: string | null;
  from: string;
  to: string | null;
}

export interface PobAsOf {
  date: string;
  total: number;
  staff: number;
  visitor: number;
  people: PobPerson[];
}

export interface RoomHistoryRow {
  room_label: string;
  installation: string | null;
  occupant: string;
  category: "staff" | "visitor";
  from: string;
  to: string | null;
  current: boolean;
}
