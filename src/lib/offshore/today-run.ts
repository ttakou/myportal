import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MOVE_KIND_LABEL, type MoveKind } from "./movement-change";
import { dueBeforeTonight, firstDayOf, mealTotals, nextDay, type MealTotals } from "./today";

/**
 * Loads the "Today" page: each role's work for the day. Read with the
 * service role and scoped to the tenant by hand; the page decides who sees
 * which section.
 */

type Row = Record<string, any>;

export interface TodayMove {
  id: string;
  name: string;
  what: string;
  firstDay: string;
  status: string;
  reason: string | null;
  due: boolean;
}

export interface TodayAsk {
  id: string;
  name: string;
  date: string;
  detail: string | null;
}

export interface TodayPax {
  id: string;
  name: string;
  position: string | null;
  boarded: boolean;
  no_show: boolean;
  visitor: boolean;
}

export interface TodayManifest {
  id: string;
  title: string;
  direction: "out" | "in";
  transport: string | null;
  status: string;
  pax: TodayPax[];
}

export interface TodayRun {
  date: string;
  manifests: { id: string; title: string; direction: "out" | "in"; pax: number }[];
}

export interface TodayArrival {
  name: string;
  manifest: string;
  why: string;
}

export interface TodayData {
  today: string;
  tomorrow: string;
  moves: TodayMove[];
  trips: TodayAsk[];
  visits: TodayAsk[];
  run: TodayRun;
  manifests: TodayManifest[];
  arrivalsNeedingBeds: TodayArrival[];
  meals: (MealTotals & { installation: string })[];
}

export async function getToday(admin: SupabaseClient, tenantId: string, today: string): Promise<TodayData> {
  const tomorrow = nextDay(today);

  const [{ data: moveRows }, { data: tripRows }, { data: visitRows }, { data: manRows }, { data: mealRows }, { data: insts }] =
    await Promise.all([
      admin
        .from("offshore_movement_requests")
        .select("id, profile_id, kind, scheduled_date, requested_date, reason, status")
        .eq("tenant_id", tenantId)
        .in("status", ["pending", "pending_endorsement"]),
      admin
        .from("offshore_trips")
        .select("id, profile_id, person_name, mobilize_date, purpose")
        .eq("tenant_id", tenantId)
        .eq("status", "requested")
        .lte("mobilize_date", tomorrow),
      admin
        .from("offshore_visit_requests")
        .select("id, visitor_name, visitor_company, depart_date, purpose")
        .eq("tenant_id", tenantId)
        .eq("status", "requested")
        .lte("depart_date", tomorrow),
      admin
        .from("offshore_manifests")
        .select("id, title, direction, transport_mode, status, scheduled_date")
        .eq("tenant_id", tenantId)
        .in("scheduled_date", [today, tomorrow])
        .neq("status", "cancelled"),
      admin
        .from("offshore_meal_entries")
        .select("installation_id, category, breakfast, snack, lunch, dinner, lodging")
        .eq("tenant_id", tenantId)
        .eq("meal_date", today),
      admin.from("offshore_installations").select("id, name").eq("tenant_id", tenantId),
    ]);

  const manifests = (manRows ?? []) as Row[];
  const ids = manifests.map((m) => String(m.id));
  const { data: paxRows } = ids.length
    ? await admin
        .from("offshore_manifest_pax")
        .select("id, manifest_id, profile_id, visit_request_id, person_name, position, boarded, no_show")
        .in("manifest_id", ids)
    : { data: [] as Row[] };
  const pax = (paxRows ?? []) as Row[];

  // Names for the people asked about.
  const profileIds = [
    ...new Set([
      ...((moveRows ?? []) as Row[]).map((r) => r.profile_id),
      ...((tripRows ?? []) as Row[]).map((r) => r.profile_id),
    ].filter(Boolean) as string[]),
  ];
  const { data: people } = profileIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", profileIds)
    : { data: [] as Row[] };
  const nameOf = new Map(((people ?? []) as Row[]).map((p) => [String(p.id), String(p.full_name || p.email || "—")]));

  const moves: TodayMove[] = ((moveRows ?? []) as Row[])
    .map((r) => {
      const firstDay = firstDayOf(r.scheduled_date, r.requested_date) ?? r.requested_date;
      return {
        id: String(r.id),
        name: nameOf.get(String(r.profile_id)) ?? "—",
        what: `${MOVE_KIND_LABEL[r.kind as MoveKind] ?? r.kind}: ${r.scheduled_date ?? "no demob date"} → ${r.requested_date}`,
        firstDay,
        status: String(r.status),
        reason: (r.reason as string | null) ?? null,
        due: dueBeforeTonight(firstDay, today),
      };
    })
    .sort((a, b) => a.firstDay.localeCompare(b.firstDay));

  const trips: TodayAsk[] = ((tripRows ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    name: (r.profile_id ? nameOf.get(String(r.profile_id)) : null) ?? (r.person_name as string) ?? "—",
    date: String(r.mobilize_date),
    detail: (r.purpose as string | null) ?? null,
  }));
  const visits: TodayAsk[] = ((visitRows ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    name: String(r.visitor_name),
    date: String(r.depart_date),
    detail: [r.visitor_company, r.purpose].filter(Boolean).join(" · ") || null,
  }));

  const paxOf = (id: string) => pax.filter((p) => String(p.manifest_id) === id);
  const byDir = (a: Row, b: Row) => (a.direction === b.direction ? 0 : a.direction === "out" ? -1 : 1);

  const todays: TodayManifest[] = manifests
    .filter((m) => m.scheduled_date === today)
    .sort(byDir)
    .map((m) => ({
      id: String(m.id),
      title: String(m.title),
      direction: m.direction as "out" | "in",
      transport: (m.transport_mode as string | null) ?? null,
      status: String(m.status),
      pax: paxOf(String(m.id))
        .map((p) => ({
          id: String(p.id),
          name: String(p.person_name ?? "—"),
          position: (p.position as string | null) ?? null,
          boarded: !!p.boarded,
          no_show: !!p.no_show,
          visitor: !!p.visit_request_id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));

  const run: TodayRun = {
    date: tomorrow,
    manifests: manifests
      .filter((m) => m.scheduled_date === tomorrow)
      .sort(byDir)
      .map((m) => ({
        id: String(m.id),
        title: String(m.title),
        direction: m.direction as "out" | "in",
        pax: paxOf(String(m.id)).length,
      })),
  };

  // Arrivals today with no bed waiting: staff with no cabin of their own,
  // visitors staying overnight with no bed allocated, still ashore.
  const arriving = pax.filter((p) =>
    manifests.some((m) => String(m.id) === String(p.manifest_id) && m.scheduled_date === today && m.direction === "out"),
  );
  const staffIds = arriving.map((p) => p.profile_id).filter(Boolean) as string[];
  const visitIds = arriving.map((p) => p.visit_request_id).filter(Boolean) as string[];
  const [{ data: staff }, { data: aboard }, { data: visitsIn }, { data: allocs }] = await Promise.all([
    staffIds.length
      ? admin.from("offshore_staff").select("profile_id, fixed_room_id").in("profile_id", staffIds)
      : Promise.resolve({ data: [] as Row[] }),
    staffIds.length
      ? admin.from("offshore_trips").select("profile_id, room_id").eq("status", "onboard").in("profile_id", staffIds)
      : Promise.resolve({ data: [] as Row[] }),
    visitIds.length
      ? admin.from("offshore_visit_requests").select("id, accommodation_required, status").in("id", visitIds)
      : Promise.resolve({ data: [] as Row[] }),
    visitIds.length
      ? admin.from("offshore_bed_allocations").select("visit_request_id, status").in("visit_request_id", visitIds)
      : Promise.resolve({ data: [] as Row[] }),
  ]);
  const cabin = new Map(((staff ?? []) as Row[]).map((s) => [String(s.profile_id), s.fixed_room_id as string | null]));
  const aboardRoom = new Map(((aboard ?? []) as Row[]).map((t) => [String(t.profile_id), t.room_id as string | null]));
  const visitOf = new Map(((visitsIn ?? []) as Row[]).map((v) => [String(v.id), v]));
  const bedded = new Set(
    ((allocs ?? []) as Row[]).filter((a) => a.status !== "checked_out").map((a) => String(a.visit_request_id)),
  );
  const titleOf = new Map(manifests.map((m) => [String(m.id), String(m.title)]));
  const arrivalsNeedingBeds: TodayArrival[] = [];
  for (const p of arriving) {
    if (p.no_show) continue;
    const manifest = titleOf.get(String(p.manifest_id)) ?? "";
    if (p.profile_id) {
      const pid = String(p.profile_id);
      if (aboardRoom.has(pid) ? aboardRoom.get(pid) : cabin.get(pid)) continue;
      arrivalsNeedingBeds.push({
        name: String(p.person_name ?? "—"),
        manifest,
        why: aboardRoom.has(pid) ? "on board with no room" : "no cabin of their own",
      });
    } else if (p.visit_request_id) {
      const v = visitOf.get(String(p.visit_request_id));
      if (!v?.accommodation_required || bedded.has(String(p.visit_request_id))) continue;
      arrivalsNeedingBeds.push({ name: String(p.person_name ?? "Visitor"), manifest, why: "visitor staying, no bed yet" });
    }
  }

  const instName = new Map(((insts ?? []) as Row[]).map((i) => [String(i.id), String(i.name)]));
  const meals = mealTotals((mealRows ?? []) as never[]).map((t) => ({
    ...t,
    installation: (t.installation_id && instName.get(t.installation_id)) || "—",
  }));

  return { today, tomorrow, moves, trips, visits, run, manifests: todays, arrivalsNeedingBeds, meals };
}
