export type VisitorStatus =
  | "pre_registered"
  | "checked_in"
  | "checked_out"
  | "cancelled";

export const VISITOR_STATUS_LABEL: Record<VisitorStatus, string> = {
  pre_registered: "Pre-registered",
  checked_in: "On site",
  checked_out: "Checked out",
  cancelled: "Cancelled",
};

export interface Visitor {
  id: string;
  full_name: string;
  company: string | null;
  purpose: string | null;
  visit_date: string;
  status: VisitorStatus;
  badge_no: string | null;
  host_name: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
}
