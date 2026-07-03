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
  /**
   * End date of a multi-day visitor pass (inclusive). Null for a classic
   * single-day visit. When set, the visitor may check in and out repeatedly
   * across [visit_date, visit_until].
   */
  visit_until: string | null;
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

/** True when the visitor holds a multi-day pass (a date range) rather than a single-day visit. */
export function isPass(v: Pick<Visitor, "visit_until">): boolean {
  return !!v.visit_until;
}

/**
 * Human-readable visit window: "2 Jul" for a single day, or "2 – 9 Jul 2026"
 * for a pass. Dates are plain YYYY-MM-DD strings (no timezone shift).
 */
export function visitRangeLabel(v: Pick<Visitor, "visit_date" | "visit_until">): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  if (!v.visit_until || v.visit_until === v.visit_date) return fmt(v.visit_date);
  return `${fmt(v.visit_date)} – ${fmt(v.visit_until)}`;
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
