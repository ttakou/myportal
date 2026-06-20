import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth";
import { today } from "@/lib/canteen";
import type {
  AttendanceStatus,
  MyAttendance,
  StaffAttendance,
} from "@/types/staff-attendance";

function deriveStatus(checkIn: string | null, checkOut: string | null): AttendanceStatus {
  if (checkOut) return "left";
  if (checkIn) return "on_site";
  return "away";
}

type ProfileRow = {
  id: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  employee_type: string | null;
};
type AttendanceRow = {
  profile_id: string;
  check_in_at: string | null;
  check_out_at: string | null;
};

/**
 * All active staff plus their attendance for `date` — the guard roster. Reads
 * are RLS-scoped: only security (visitors:operate) and admins see the whole
 * tenant's attendance, so this is meant for the gate/reception view.
 */
export async function getStaffRoster(date: string = today()): Promise<StaffAttendance[]> {
  const supabase = createClient();
  const [{ data: staff }, { data: attendance }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, department, job_title, employee_type")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("staff_attendance")
      .select("profile_id, check_in_at, check_out_at")
      .eq("attendance_date", date),
  ]);

  const byId = new Map(
    ((attendance ?? []) as AttendanceRow[]).map((a) => [a.profile_id, a]),
  );
  return ((staff ?? []) as ProfileRow[]).map((p) => {
    const a = byId.get(p.id);
    const checkIn = a?.check_in_at ?? null;
    const checkOut = a?.check_out_at ?? null;
    return {
      profile_id: p.id,
      full_name: p.full_name,
      department: p.department ?? null,
      job_title: p.job_title ?? null,
      employee_type: p.employee_type ?? null,
      status: deriveStatus(checkIn, checkOut),
      check_in_at: checkIn,
      check_out_at: checkOut,
    };
  });
}

/** The signed-in user's own attendance for `date` — for the "I'm in" card. */
export async function getMyAttendance(date: string = today()): Promise<MyAttendance> {
  const user = await getCachedUser();
  if (!user) return { status: "away", check_in_at: null, check_out_at: null };
  const supabase = createClient();
  const { data } = await supabase
    .from("staff_attendance")
    .select("check_in_at, check_out_at")
    .eq("profile_id", user.id)
    .eq("attendance_date", date)
    .maybeSingle();
  const checkIn = (data?.check_in_at as string | null) ?? null;
  const checkOut = (data?.check_out_at as string | null) ?? null;
  return { status: deriveStatus(checkIn, checkOut), check_in_at: checkIn, check_out_at: checkOut };
}
