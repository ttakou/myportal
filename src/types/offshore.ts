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
  room_number: string;
  room_type: string;
  bed_count: number;
  max_bed_count: number;
  gender_restriction: GenderRestriction;
  status: RoomStatus;
  special_flag: string | null;
  notes: string | null;
  fixed_assigned: number;
}

export interface RosterEntry {
  id: string;
  profile_id: string;
  full_name: string | null;
  email: string;
  crew_id: string | null;
  crew_name: string | null;
  position: string | null;
  fixed_room_id: string | null;
  fixed_room_label: string | null;
  fixed_bed: string | null;
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
  byCategory: { staff: number; visitor: number };
  arrivalsToday: number;
  departuresToday: number;
  overstayers: { name: string; installation: string | null; demob_date: string | null }[];
}

export interface AccommodationSummary {
  totalRooms: number;
  totalBeds: number;
  fixedBeds: number;
  occupiedBeds: number;
  blockedRooms: number;
  availableBeds: number;
}

export interface CertAlert {
  full_name: string | null;
  kind: "medical" | "bosiet" | "huet";
  expiry: string;
  expired: boolean;
}
