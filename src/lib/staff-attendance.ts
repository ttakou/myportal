import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth";
import { today } from "@/lib/canteen";
import type {
  AttendanceStatus,
  MyAttendance,
  StaffAttendance,
  StaffOnSite,
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
  vehicle_type: string | null;
  vehicle_plate: string | null;
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
      .select("profile_id, check_in_at, check_out_at, vehicle_type, vehicle_plate")
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
      vehicle_type: a?.vehicle_type ?? null,
      vehicle_plate: a?.vehicle_plate ?? null,
    };
  });
}

/**
 * Staff currently checked in on `date` (checked in, not yet out) — the staff
 * half of the emergency muster. Admins/operate holders see the whole tenant.
 */
export async function getStaffOnSite(date: string = today()): Promise<StaffOnSite[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("staff_attendance")
    .select(
      "profile_id, check_in_at, profiles!staff_attendance_profile_id_fkey(full_name, department, job_title)",
    )
    .eq("attendance_date", date)
    .not("check_in_at", "is", null)
    .is("check_out_at", null)
    .order("check_in_at", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const pr = r.profiles as
      | { full_name?: string; department?: string | null; job_title?: string | null }
      | { full_name?: string; department?: string | null; job_title?: string | null }[]
      | null;
    const p = Array.isArray(pr) ? pr[0] : pr;
    return {
      profile_id: r.profile_id as string,
      full_name: p?.full_name ?? "—",
      department: p?.department ?? null,
      job_title: p?.job_title ?? null,
      check_in_at: (r.check_in_at as string | null) ?? null,
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
