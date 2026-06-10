import { createClient } from "@/lib/supabase/server";
import type { MedicalRecord } from "@/types/medical";

const SELECT =
  "id, profile_id, fitness_status, exam_date, expiry_date, restrictions, notes, person_name, person_email";

/** The current user's own latest medical record (confidential). */
export async function getMyMedical(): Promise<MedicalRecord | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("medical_current")
    .select(SELECT)
    .eq("profile_id", user.id)
    .maybeSingle();
  return (data as MedicalRecord) ?? null;
}

/** Roster of current records for all staff — medical officers only (RLS). */
export async function getMedicalRoster(): Promise<MedicalRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("medical_current")
    .select(SELECT)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) {
    console.error("getMedicalRoster:", error.message);
    return [];
  }
  return (data ?? []) as MedicalRecord[];
}
