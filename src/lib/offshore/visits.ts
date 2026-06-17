import { createClient } from "@/lib/supabase/server";
import type { VisitRequest } from "@/types/offshore";
import { one } from "./_shared";

function mapVisit(row: Record<string, any>): VisitRequest {
  const alloc = (row.offshore_bed_allocations as any[])?.find((a) => a.status !== "checked_out");
  const room = alloc && (Array.isArray(alloc.room) ? alloc.room[0] : alloc.room);
  return {
    id: row.id,
    group_id: row.group_id ?? null,
    requester_name: one<{ full_name?: string }>(row.requester)?.full_name ?? null,
    visitor_name: row.visitor_name,
    visitor_company: row.visitor_company,
    visitor_type: row.visitor_type,
    gender: row.gender,
    host_department: row.host_department,
    host_name: row.host_name,
    purpose: row.purpose,
    installation_id: row.installation_id,
    installation_name: one<{ name?: string }>(row.installation)?.name ?? null,
    depart_date: row.depart_date,
    return_date: row.return_date,
    overnight: row.overnight,
    accommodation_required: row.accommodation_required,
    emergency_contact: row.emergency_contact,
    status: row.status,
    reject_reason: row.reject_reason,
    allocation: alloc
      ? {
          id: alloc.id,
          room_id: alloc.room_id,
          room_label: room ? [room.block, room.room_number].filter(Boolean).join(" ") : null,
          from_date: alloc.from_date,
          to_date: alloc.to_date,
          status: alloc.status,
        }
      : null,
  };
}

const VISIT_SELECT =
  "id, group_id, visitor_name, visitor_company, visitor_type, gender, host_department, host_name, purpose," +
  " installation_id, depart_date, return_date, overnight, accommodation_required, emergency_contact," +
  " status, reject_reason," +
  " requester:profiles!offshore_visit_requests_requester_id_fkey(full_name)," +
  " installation:offshore_installations(name)," +
  " offshore_bed_allocations(id, room_id, from_date, to_date, status, room:offshore_rooms(room_number, block))";

/** Existing names + companies, to suggest/de-duplicate while raising visit requests. */
export async function getVisitorSuggestions(): Promise<{ names: string[]; companies: string[] }> {
  const supabase = createClient();
  const [{ data: profiles }, { data: staff }, { data: visits }] = await Promise.all([
    supabase.from("profiles").select("full_name").not("full_name", "is", null),
    supabase.from("offshore_staff").select("company").not("company", "is", null),
    supabase.from("offshore_visit_requests").select("visitor_name, visitor_company"),
  ]);
  const names = new Set<string>();
  for (const p of profiles ?? []) if (p.full_name) names.add(p.full_name as string);
  for (const v of visits ?? []) if (v.visitor_name) names.add(v.visitor_name as string);
  const companies = new Set<string>();
  for (const s of staff ?? []) if (s.company) companies.add(s.company as string);
  for (const v of visits ?? []) if (v.visitor_company) companies.add(v.visitor_company as string);
  return {
    names: [...names].sort((a, b) => a.localeCompare(b)),
    companies: [...companies].sort((a, b) => a.localeCompare(b)),
  };
}

export async function getMyVisitRequests(): Promise<VisitRequest[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("offshore_visit_requests")
    .select(VISIT_SELECT)
    .eq("requester_id", user.id)
    .order("depart_date", { ascending: false });
  return (data ?? []).map((r) => mapVisit(r as Record<string, any>));
}

export async function getAllVisitRequests(): Promise<VisitRequest[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_visit_requests")
    .select(VISIT_SELECT)
    .order("depart_date", { ascending: false });
  return (data ?? []).map((r) => mapVisit(r as Record<string, any>));
}
