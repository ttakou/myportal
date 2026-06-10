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
