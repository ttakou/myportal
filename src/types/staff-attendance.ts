/** Derived presence state for a staff member on a given day. */
export type AttendanceStatus = "away" | "on_site" | "left";

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  away: "Not in",
  on_site: "On site",
  left: "Left",
};

/** A staff member with their attendance for the day (guard roster row). */
export type StaffAttendance = {
  profile_id: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  employee_type: string | null;
  status: AttendanceStatus;
  check_in_at: string | null;
  check_out_at: string | null;
  /** Vehicle the guard recorded at the gate on check-in (optional). */
  vehicle_type: string | null;
  vehicle_plate: string | null;
  /** Optional free-text notes security added at check-in / check-out. */
  check_in_comment: string | null;
  check_out_comment: string | null;
};

/** The signed-in user's own attendance for the day (self check-in card). */
export type MyAttendance = {
  status: AttendanceStatus;
  check_in_at: string | null;
  check_out_at: string | null;
};

/** A staff member currently checked in — for the emergency muster. */
export type StaffOnSite = {
  profile_id: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  check_in_at: string | null;
};
