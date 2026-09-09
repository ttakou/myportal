import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getModuleSettingsForTenant } from "@/lib/module-settings";
import { seedTaskChecklist } from "@/lib/task-checklist";
import { shuttleDepartAt, shuttleRunsOn } from "@/lib/transport/shuttles";
import type { Shuttle } from "@/types/transport";

/**
 * Turn the day's recurring shuttles into tasks.
 *
 * For every tenant with the transportation module (or one tenant, when the
 * desk presses "create today's runs"), each active shuttle that runs on the
 * date gets one task: assigned when the shuttle names a driver, pending
 * otherwise, with the standard checklist. The unique index on
 * (shuttle_id, shuttle_date) makes a re-run harmless.
 */
export async function runTransportShuttles(
  dateIso: string = new Date().toISOString().slice(0, 10),
  onlyTenant?: string,
): Promise<{ ok: boolean; date: string; created: number; tenants: number; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, date: dateIso, created: 0, tenants: 0, error: "Service-role key missing." };

  let q = admin
    .from("tenant_services")
    .select("tenant_id, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "transportation")
    .eq("is_active", true);
  if (onlyTenant) q = q.eq("tenant_id", onlyTenant);
  const { data: services } = await q;

  let created = 0;
  let tenants = 0;
  for (const svc of (services ?? []) as { tenant_id: string }[]) {
    tenants += 1;
    const tenantId = svc.tenant_id;
    const [{ data: shuttles }, { data: existing }, cfg] = await Promise.all([
      admin
        .from("transport_shuttles")
        .select("id, name, pickup, dropoff, depart_time, days_of_week, passengers, task_type, driver_id, vehicle_id, is_active")
        .eq("tenant_id", tenantId)
        .eq("is_active", true),
      admin.from("transport_requests").select("shuttle_id").eq("tenant_id", tenantId).eq("shuttle_date", dateIso),
      getModuleSettingsForTenant(admin, tenantId, "transportation"),
    ]);
    const done = new Set((existing ?? []).map((r) => r.shuttle_id as string));
    for (const raw of (shuttles ?? []) as Record<string, unknown>[]) {
      const shuttle = { ...raw, depart_time: String(raw.depart_time).slice(0, 5) } as unknown as Shuttle;
      if (done.has(shuttle.id) || !shuttleRunsOn(shuttle, dateIso)) continue;
      const { data, error } = await admin
        .from("transport_requests")
        .insert({
          tenant_id: tenantId,
          shuttle_id: shuttle.id,
          shuttle_date: dateIso,
          pickup: shuttle.pickup,
          dropoff: shuttle.dropoff,
          depart_at: shuttleDepartAt(shuttle, dateIso),
          passengers: shuttle.passengers,
          purpose: shuttle.name,
          task_type: shuttle.task_type,
          driver_id: shuttle.driver_id,
          vehicle_id: shuttle.vehicle_id,
          status: shuttle.driver_id ? "assigned" : "pending",
        })
        .select("id")
        .maybeSingle();
      if (error) {
        // The unique index: another run got there first. Anything else is logged.
        if (!/transport_requests_shuttle_day/.test(error.message)) {
          console.error(`shuttle ${shuttle.name}: ${error.message}`);
        }
        continue;
      }
      created += 1;
      if (data && cfg.seed_checklists !== false) {
        await seedTaskChecklist(admin, tenantId, data.id, shuttle.task_type);
      }
    }
  }
  return { ok: true, date: dateIso, created, tenants };
}
