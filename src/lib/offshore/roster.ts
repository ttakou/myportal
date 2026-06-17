import { createClient } from "@/lib/supabase/server";
import type { AssignableEmployee, CertAlert, RosterEntry } from "@/types/offshore";
import { one } from "./_shared";

export async function getRoster(): Promise<RosterEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("offshore_staff")
    .select(
      "id, profile_id, crew_id, position, company, back_to_back_id, fixed_room_id, fixed_bed," +
        " lifeboat, medical_expiry, bosiet_expiry, huet_expiry, emergency_contact, travel_eligible," +
        " profile:profiles!offshore_staff_profile_id_fkey(full_name, email)," +
        " b2b:profiles!offshore_staff_back_to_back_id_fkey(full_name)," +
        " crew:offshore_crews(name), room:offshore_rooms(room_number, block, lifeboat)",
    );
  if (error) {
    console.error("getRoster:", error.message);
    return [];
  }
  return (data ?? [])
    .map((r: Record<string, any>) => {
      const p = one<{ full_name?: string; email?: string }>(r.profile);
      const room = one<{ room_number?: string; block?: string; lifeboat?: string }>(r.room);
      return {
        id: r.id,
        profile_id: r.profile_id,
        full_name: p?.full_name ?? null,
        email: p?.email ?? "",
        crew_id: r.crew_id,
        crew_name: one<{ name?: string }>(r.crew)?.name ?? null,
        position: r.position,
        company: r.company,
        back_to_back_id: r.back_to_back_id,
        back_to_back_name: one<{ full_name?: string }>(r.b2b)?.full_name ?? null,
        fixed_room_id: r.fixed_room_id,
        fixed_room_label: room
          ? [room.block, room.room_number].filter(Boolean).join(" ")
          : null,
        fixed_bed: r.fixed_bed,
        // Muster follows the fixed room; fall back to any stored value.
        lifeboat: (room?.lifeboat as string | null) ?? r.lifeboat ?? null,
        medical_expiry: r.medical_expiry,
        bosiet_expiry: r.bosiet_expiry,
        huet_expiry: r.huet_expiry,
        emergency_contact: r.emergency_contact,
        travel_eligible: r.travel_eligible,
      } as RosterEntry;
    })
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
}

/** All active tenant employees with their current crew, for the crew builder. */
export async function getAssignableEmployees(): Promise<AssignableEmployee[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email," +
        " offshore_staff!offshore_staff_profile_id_fkey(crew_id, crew:offshore_crews(name))",
    )
    .eq("is_active", true)
    .order("full_name");
  if (error) {
    console.error("getAssignableEmployees:", error.message);
    return [];
  }
  return (data ?? []).map((p: Record<string, any>) => {
    const s = one<{ crew_id?: string; crew?: unknown }>(p.offshore_staff);
    return {
      id: p.id,
      name: (p.full_name as string) || (p.email as string) || "Unknown",
      crew_id: s?.crew_id ?? null,
      crew_name: s ? one<{ name?: string }>(s.crew as any)?.name ?? null : null,
    };
  });
}

/** Tenant profiles not yet on the offshore roster, for adding members. */
export async function getAddableProfiles(): Promise<{ id: string; full_name: string }[]> {
  const supabase = createClient();
  const [{ data: profiles }, { data: staff }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase.from("offshore_staff").select("profile_id"),
  ]);
  const taken = new Set((staff ?? []).map((s) => s.profile_id as string));
  return (profiles ?? [])
    .filter((p) => !taken.has(p.id as string))
    .map((p) => ({ id: p.id as string, full_name: (p.full_name as string) ?? "" }));
}

/** Expired / soon-to-expire certifications across the roster. */
export async function getCertAlerts(): Promise<CertAlert[]> {
  const roster = await getRoster();
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 86400_000);
  const alerts: CertAlert[] = [];
  const check = (name: string | null, kind: CertAlert["kind"], date: string | null) => {
    if (!date) return;
    const d = new Date(date);
    if (d <= soon) alerts.push({ full_name: name, kind, expiry: date, expired: d < now });
  };
  for (const r of roster) {
    check(r.full_name, "medical", r.medical_expiry);
    check(r.full_name, "bosiet", r.bosiet_expiry);
    check(r.full_name, "huet", r.huet_expiry);
  }
  return alerts.sort((a, b) => a.expiry.localeCompare(b.expiry));
}
