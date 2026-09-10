import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getModuleSettingsForTenant } from "@/lib/module-settings";
import { notifyUsers } from "@/lib/notify";
import { deskIdsFor } from "@/lib/transport-desk";
import { dueReminders, lateStarts, minutesLate, type LiveTask } from "@/lib/transport/live";

/**
 * The live transport job, every five minutes (Vercel Cron, see
 * vercel.json): remind each driver shortly before a task departs, and tell
 * the desk (and the driver) when a task is past departure with nobody on
 * the way. Each task is reminded and alerted at most once — the stamps on
 * the row say so — and the windows are tenant settings.
 */
export async function runTransportLive(
  nowIso: string = new Date().toISOString(),
): Promise<{ ok: boolean; reminded: number; late: number; tenants: number; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reminded: 0, late: 0, tenants: 0, error: "Service-role key missing." };

  const { data: services } = await admin
    .from("tenant_services")
    .select("tenant_id, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "transportation")
    .eq("is_active", true);

  let reminded = 0;
  let late = 0;
  let tenants = 0;
  for (const svc of (services ?? []) as { tenant_id: string }[]) {
    tenants += 1;
    const r = await runTenant(admin, svc.tenant_id, nowIso);
    reminded += r.reminded;
    late += r.late;
  }
  return { ok: true, reminded, late, tenants };
}

interface Row extends LiveTask {
  pickup: string;
  dropoff: string;
  requester_id: string | null;
  shuttle_id: string | null;
  shuttle_date: string | null;
  driver: { full_name?: string; profile_id?: string | null } | { full_name?: string; profile_id?: string | null }[] | null;
}

function driverOf(row: Row): { full_name?: string; profile_id?: string | null } | null {
  return (Array.isArray(row.driver) ? row.driver[0] : row.driver) ?? null;
}

function fmtLocal(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Douala",
  });
}

async function runTenant(admin: SupabaseClient, tenantId: string, nowIso: string): Promise<{ reminded: number; late: number }> {
  const cfg = await getModuleSettingsForTenant(admin, tenantId, "transportation");
  const remindMin = Number(cfg.driver_reminder_minutes ?? 30);
  const lateMin = Number(cfg.late_start_alert_minutes ?? 15);
  if (!(remindMin > 0) && !(lateMin > 0)) return { reminded: 0, late: 0 };

  // One window covers both questions: from a day back (a task nobody
  // touched all day is still worth one alert) to the reminder horizon.
  const now = Date.parse(nowIso);
  const { data } = await admin
    .from("transport_requests")
    .select("id, status, depart_at, driver_id, reminded_at, late_alerted_at, pickup, dropoff, requester_id, shuttle_id, shuttle_date, driver:transport_drivers(full_name, profile_id)")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "assigned"])
    .gte("depart_at", new Date(now - 86_400_000).toISOString())
    .lte("depart_at", new Date(now + Math.max(remindMin, 0) * 60_000).toISOString());
  const rows = (data ?? []) as unknown as Row[];

  let reminded = 0;
  for (const t of dueReminders(rows, nowIso, remindMin)) {
    const d = driverOf(t);
    const { error } = await admin.from("transport_requests").update({ reminded_at: nowIso }).eq("id", t.id).is("reminded_at", null);
    if (error) continue;
    reminded += 1;
    if (d?.profile_id) {
      await notifyUsers({
        tenantId,
        profileIds: [d.profile_id],
        category: "transport",
        title: `Departure at ${fmtLocal(t.depart_at).slice(-5)}: ${t.pickup} → ${t.dropoff}`,
        body: `Leaves in ${Math.max(1, -minutesLate(t.depart_at, nowIso))} min. Press Start trip when you set off.`,
        url: "/transportation?view=driver",
      });
    }
    // Seat holders on a shuttle run get the same nudge.
    if (t.shuttle_id && t.shuttle_date) {
      const { data: seats } = await admin
        .from("transport_shuttle_seats")
        .select("profile_id")
        .eq("shuttle_id", t.shuttle_id)
        .eq("ride_date", t.shuttle_date)
        .is("cancelled_at", null);
      await notifyUsers({
        tenantId,
        profileIds: (seats ?? []).map((x) => x.profile_id as string),
        category: "transport",
        title: `Shuttle leaves at ${fmtLocal(t.depart_at).slice(-5)} from ${t.pickup}`,
        body: `${t.pickup} → ${t.dropoff} in ${Math.max(1, -minutesLate(t.depart_at, nowIso))} min${d?.full_name ? ` · driver ${d.full_name}` : ""}.`,
        url: "/transportation?view=seats",
      });
    }
  }

  const lateOnes = lateStarts(rows, nowIso, lateMin);
  let late = 0;
  if (lateOnes.length > 0) {
    const desk = await deskIdsFor(admin, tenantId);
    for (const t of lateOnes) {
      const { error } = await admin.from("transport_requests").update({ late_alerted_at: nowIso }).eq("id", t.id).is("late_alerted_at", null);
      if (error) continue;
      late += 1;
      const d = driverOf(t);
      const route = `${t.pickup} → ${t.dropoff}`;
      const by = minutesLate(t.depart_at, nowIso);
      const who = t.driver_id ? `${d?.full_name ?? "the driver"} has not started` : "no driver is assigned";
      await notifyUsers({
        tenantId,
        profileIds: desk,
        category: "transport",
        title: `Not started: ${route}`,
        body: `Due ${fmtLocal(t.depart_at)}, ${by} min ago, and ${who}.`,
        url: "/transportation?view=dispatch",
      });
      if (d?.profile_id) {
        await notifyUsers({
          tenantId,
          profileIds: [d.profile_id],
          category: "transport",
          title: `Task overdue: ${route}`,
          body: `It was due ${fmtLocal(t.depart_at)}. Press Start trip, or tell the desk on the task thread.`,
          url: "/transportation?view=driver",
        });
      }
    }
  }
  return { reminded, late };
}
