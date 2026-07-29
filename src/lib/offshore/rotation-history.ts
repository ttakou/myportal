import { createClient } from "@/lib/supabase/server";
import type {
  RotationStaffOption,
  StaffRotationHistory,
  RotationHistoryTrip,
} from "@/types/offshore";
import { one } from "./_shared";

/** The offshore-staff roster as picker options (name + current crew/company). */
export async function getRotationStaffList(): Promise<RotationStaffOption[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_staff")
    .select("profile_id, company, person:profiles!offshore_staff_profile_id_fkey(full_name), crew:offshore_crews(name)");
  const rows = (data ?? []).map((r: Record<string, any>) => ({
    profile_id: r.profile_id as string,
    name: one<{ full_name?: string }>(r.person)?.full_name ?? "—",
    company: (r.company as string) ?? null,
    crew: one<{ name?: string }>(r.crew)?.name ?? null,
  }));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Whole-days between two ISO dates (demob − mob), floored at 0. */
function daysBetween(from: string | null, to: string): number | null {
  if (!from) return null;
  const d = Math.round((+new Date(`${to}T00:00:00Z`) - +new Date(`${from}T00:00:00Z`)) / 86400000);
  return d >= 0 ? d : 0;
}

/**
 * One employee's complete offshore rotation timeline: every trip (mobilise →
 * demobilise), newest first, with duration, plus a career summary. Powers the
 * per-staff rotation-history view. Days for a still-onboard trip run to today.
 */
export async function getStaffRotationHistory(profileId: string): Promise<StaffRotationHistory> {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: staff }, { data: trips }] = await Promise.all([
    supabase
      .from("offshore_staff")
      .select("company, person:profiles!offshore_staff_profile_id_fkey(full_name), crew:offshore_crews(name), installation:offshore_installations(name)")
      .eq("profile_id", profileId)
      .maybeSingle(),
    supabase
      .from("offshore_trips")
      .select("id, mobilize_date, demob_date, status, mode, person_name, installation:offshore_installations(name)")
      .eq("profile_id", profileId)
      .order("mobilize_date", { ascending: false }),
  ]);

  const rows: RotationHistoryTrip[] = ((trips ?? []) as Record<string, any>[]).map((t) => {
    const active = t.status === "onboard";
    const end = t.demob_date ?? (active ? today : null);
    return {
      id: t.id as string,
      installation_name: one<{ name?: string }>(t.installation)?.name ?? null,
      mobilize_date: t.mobilize_date ?? null,
      demob_date: t.demob_date ?? null,
      status: t.status as string,
      mode: t.mode === "manual" ? "manual" : "auto",
      days: end ? daysBetween(t.mobilize_date, end) : null,
      onboard: active,
    };
  });

  // Days offshore only counts trips that were actually served (onboard/done).
  const served = rows.filter((r) => r.status === "onboard" || r.status === "demobilised");
  const totalDays = served.reduce((s, r) => s + (r.days ?? 0), 0);
  const withDays = served.filter((r) => r.days != null);
  const mobs = rows.map((r) => r.mobilize_date).filter(Boolean) as string[];
  const demobs = rows.map((r) => r.demob_date).filter(Boolean) as string[];

  const person = one<{ full_name?: string }>(staff?.person ?? null);
  return {
    person: {
      profile_id: profileId,
      name: person?.full_name ?? "—",
      company: (staff?.company as string) ?? null,
      crew: one<{ name?: string }>(staff?.crew ?? null)?.name ?? null,
      installation: one<{ name?: string }>(staff?.installation ?? null)?.name ?? null,
    },
    trips: rows,
    summary: {
      trips: rows.length,
      totalDaysOffshore: totalDays,
      avgTripDays: withDays.length ? Math.round(totalDays / withDays.length) : null,
      firstMobilise: mobs.length ? mobs.reduce((a, b) => (a < b ? a : b)) : null,
      lastDemobilise: demobs.length ? demobs.reduce((a, b) => (a > b ? a : b)) : null,
      currentlyOnboard: rows.some((r) => r.status === "onboard"),
    },
  };
}
