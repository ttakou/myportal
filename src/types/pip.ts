export type PipStatus = "open" | "met" | "not_met" | "cancelled";

export const PIP_STATUS_LABEL: Record<PipStatus, string> = {
  open: "Open",
  met: "Met",
  not_met: "Not met",
  cancelled: "Cancelled",
};

export interface Pip {
  id: string;
  profile_id: string;
  employee_name: string | null;
  manager_name: string | null;
  concern: string;
  expectations: string | null;
  support: string | null;
  start_date: string;
  review_date: string | null;
  status: PipStatus;
  outcome: string | null;
  /** Whether this is the viewer's own PIP (employee, read-only). */
  is_own: boolean;
}

export interface PipData {
  pips: Pip[];
  /** The viewer can raise/manage PIPs (a manager with reports, or HR/admin). */
  canManage: boolean;
}
