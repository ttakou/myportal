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

export type TransportTaskType =
  | "passenger"
  | "airport_pickup"
  | "airport_dropoff"
  | "delivery"
  | "errand"
  | "other";

export const TASK_TYPE_LABEL: Record<TransportTaskType, string> = {
  passenger: "Passenger trip",
  airport_pickup: "Airport pickup",
  airport_dropoff: "Airport drop-off",
  delivery: "Delivery",
  errand: "Errand",
  other: "Other",
};

export type TransportPriority = "normal" | "high" | "urgent";

export const PRIORITY_LABEL: Record<TransportPriority, string> = {
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export type VehicleStatus = "active" | "maintenance" | "retired";

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  active: "Active",
  maintenance: "In maintenance",
  retired: "Retired",
};

export interface Vehicle {
  id: string;
  name: string;
  plate: string | null;
  capacity: number;
  status: VehicleStatus;
}

export interface Driver {
  id: string;
  full_name: string;
  phone: string | null;
  profile_id: string | null;
  on_duty: boolean;
}

export interface ChecklistItem {
  id: string;
  label: string;
  sort_order: number;
  done: boolean;
  done_at: string | null;
}

/** Default checklist seeded onto a new task, per task type. */
export const CHECKLIST_TEMPLATE: Record<TransportTaskType, string[]> = {
  airport_pickup: [
    "Confirm flight time",
    "Prepare name board",
    "Arrive at airport",
    "Meet traveller",
    "Load luggage",
    "Drop off at destination",
  ],
  airport_dropoff: [
    "Confirm departure time",
    "Pick up traveller",
    "Load luggage",
    "Drop off at terminal",
  ],
  passenger: ["Arrive at pickup point", "Passenger on board", "Drop off complete"],
  delivery: ["Collect item(s)", "In transit", "Delivered & confirmed"],
  errand: ["Errand started", "Errand completed"],
  other: ["Task started", "Task completed"],
};

export interface TaskUpdate {
  id: string;
  author_name: string | null;
  note: string | null;
  new_status: TransportStatus | null;
  created_at: string;
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
  task_type: TransportTaskType;
  priority: TransportPriority;
  notes: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_name: string | null;
  updates: TaskUpdate[];
  checklist: ChecklistItem[];
}
