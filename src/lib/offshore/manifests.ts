import { createClient } from "@/lib/supabase/server";
import type { Manifest, ManifestPax } from "@/types/offshore";
import { one } from "./_shared";

function paxIssues(staff: Record<string, any> | undefined): string[] {
  if (!staff) return [];
  const issues: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  if (staff.travel_eligible === false) issues.push("not eligible");
  if (staff.medical_expiry && staff.medical_expiry < today) issues.push("medical expired");
  if (staff.bosiet_expiry && staff.bosiet_expiry < today) issues.push("BOSIET expired");
  if (staff.huet_expiry && staff.huet_expiry < today) issues.push("HUET expired");
  return issues;
}

export async function getManifests(): Promise<Manifest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("offshore_manifests")
    .select(
      "id, title, crew_id, installation_id, trip_type, direction, transport_mode, seat_capacity," +
        " scheduled_date, status, crew:offshore_crews(name), installation:offshore_installations(name)," +
        " offshore_manifest_pax(id, profile_id, visit_request_id, person_name, position, boarded, no_show)",
    )
    .order("scheduled_date", { ascending: false });
  if (error) {
    console.error("getManifests:", error.message);
    return [];
  }

  // Eligibility is computed live from the roster so locked manifests still warn.
  const { data: staffRows } = await supabase
    .from("offshore_staff")
    .select("profile_id, travel_eligible, medical_expiry, bosiet_expiry, huet_expiry");
  const staffByProfile = new Map<string, Record<string, any>>();
  for (const s of staffRows ?? []) staffByProfile.set(s.profile_id as string, s);

  return (data ?? []).map((m: Record<string, any>) => ({
    id: m.id,
    title: m.title,
    crew_id: m.crew_id,
    crew_name: one<{ name?: string }>(m.crew)?.name ?? null,
    installation_id: m.installation_id,
    installation_name: one<{ name?: string }>(m.installation)?.name ?? null,
    trip_type: m.trip_type,
    direction: m.direction,
    transport_mode: m.transport_mode,
    seat_capacity: m.seat_capacity,
    scheduled_date: m.scheduled_date,
    status: m.status,
    pax: ((m.offshore_manifest_pax as any[]) ?? [])
      .map(
        (p): ManifestPax => ({
          id: p.id,
          profile_id: p.profile_id,
          visit_request_id: p.visit_request_id ?? null,
          person_name: p.person_name,
          position: p.position,
          boarded: p.boarded,
          no_show: p.no_show,
          issues: p.profile_id ? paxIssues(staffByProfile.get(p.profile_id)) : [],
        }),
      )
      .sort((a, b) => a.person_name.localeCompare(b.person_name)),
  }));
}

/** One manifest with its passengers, for the printable report. */
export async function getManifestById(id: string): Promise<Manifest | null> {
  const all = await getManifests();
  return all.find((m) => m.id === id) ?? null;
}
