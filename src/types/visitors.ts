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
  vehicle_type: string | null;
  vehicle_plate: string | null;
  host_name: string | null;
  /** Department / service the visit is for (distinct from the host individual). */
  service: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  /** Accompanying minors, by age band — captured for security/muster headcount. */
  accompanying_infants: number;
  accompanying_children: number;
  accompanying_adolescents: number;
}

type AccompanyingCounts = Pick<
  Visitor,
  "accompanying_infants" | "accompanying_children" | "accompanying_adolescents"
>;

/** Total accompanying minors for a visitor. */
export function accompanyingTotal(v: AccompanyingCounts): number {
  return v.accompanying_infants + v.accompanying_children + v.accompanying_adolescents;
}

/** "1 infant, 2 children" style breakdown, or "" when none. */
export function accompanyingSummary(v: AccompanyingCounts): string {
  const parts: string[] = [];
  if (v.accompanying_infants) parts.push(`${v.accompanying_infants} infant${v.accompanying_infants === 1 ? "" : "s"}`);
  if (v.accompanying_children) parts.push(`${v.accompanying_children} child${v.accompanying_children === 1 ? "" : "ren"}`);
  if (v.accompanying_adolescents) parts.push(`${v.accompanying_adolescents} adolescent${v.accompanying_adolescents === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/** Common vehicle types for the reception check-in / pre-registration form. */
export const VEHICLE_TYPES = [
  "Car",
  "Pickup",
  "Van",
  "Bus",
  "Truck",
  "Motorcycle",
  "Other",
] as const;
