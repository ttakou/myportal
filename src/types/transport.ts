export type TransportStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled";

export const TRANSPORT_STATUS_LABEL: Record<TransportStatus, string> = {
  pending: "Pending",
  assigned: "Assigned",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export interface Vehicle {
  id: string;
  name: string;
  plate: string | null;
  capacity: number;
}

export interface Driver {
  id: string;
  full_name: string;
  phone: string | null;
}

export interface TransportRequest {
  id: string;
  requester_name: string | null;
  pickup: string;
  dropoff: string;
  depart_at: string;
  passengers: number;
  purpose: string | null;
  status: TransportStatus;
  driver_id: string | null;
  vehicle_id: string | null;
  driver_name: string | null;
  vehicle_name: string | null;
}
