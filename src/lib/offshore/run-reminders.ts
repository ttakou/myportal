import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notify";
import { siteToday } from "./manifest-order";

/**
 * Midday nudge: a run the night job moved people on that nobody has
 * confirmed yet. First the Dispatcher (12:00 Douala), then, if still open,
 * the OIM (15:00). One notice per run and stage; confirming or postponing
 * the run clears it (ref "runconfirm:<manifest id>").
 */

type Row = Record<string, any>;
export type ReminderStage = "desk" | "oim";

export const runConfirmRef = (manifestId: string) => `runconfirm:${manifestId}`;

async function holders(admin: SupabaseClient, tenantId: string, roles: string[]): Promise<string[]> {
  const { data } = await admin
    .from("profile_roles")
    .select("profile_id, profiles!inner(is_active, tenant_id)")
    .in("role", roles)
    .eq("profiles.tenant_id", tenantId)
    .eq("profiles.is_active", true);
  return [...new Set(((data ?? []) as Row[]).map((r) => String(r.profile_id)))];
}

/** Today's runs the night job moved people on that are not confirmed yet. */
export async function unconfirmedRuns(admin: SupabaseClient, tenantId: string, today: string) {
  const { data: runs } = await admin
    .from("offshore_manifests")
    .select("id, title, direction, offshore_manifest_pax(profile_id)")
    .eq("tenant_id", tenantId)
    .eq("scheduled_date", today)
    .not("status", "in", "(completed,cancelled)");
  const { data: moved } = await admin
    .from("offshore_trips")
    .select("profile_id, status")
    .eq("tenant_id", tenantId)
    .or(`and(status.eq.onboard,mobilize_date.eq.${today}),and(status.eq.demobilised,demob_date.eq.${today})`);
  const came = new Set(((moved ?? []) as Row[]).filter((t) => t.status === "onboard").map((t) => String(t.profile_id)));
  const left = new Set(((moved ?? []) as Row[]).filter((t) => t.status === "demobilised").map((t) => String(t.profile_id)));
  return ((runs ?? []) as Row[])
    .map((r) => ({
      id: String(r.id),
      title: String(r.title),
      moved: ((r.offshore_manifest_pax ?? []) as Row[]).filter((p) =>
        p.profile_id ? (r.direction === "out" ? came : left).has(String(p.profile_id)) : false,
      ).length,
    }))
    .filter((r) => r.moved > 0);
}

export async function remindUnconfirmedRuns(stage: ReminderStage): Promise<{ ok: boolean; reminded: number; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reminded: 0, error: "Service-role key missing." };
  const today = siteToday();
  const { data: services } = await admin
    .from("tenant_services")
    .select("tenant_id, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "offshore")
    .eq("is_active", true);
  let reminded = 0;
  for (const svc of (services ?? []) as Row[]) {
    const tenantId = String(svc.tenant_id);
    const runs = await unconfirmedRuns(admin, tenantId, today);
    if (!runs.length) continue;
    const to = await holders(admin, tenantId, stage === "desk" ? ["dispatcher"] : ["oim"]);
    for (const r of runs) {
      // One per run and stage: skip whoever already has this one.
      const title = stage === "desk" ? `Today's run isn't confirmed yet: ${r.title}` : `Still unconfirmed this afternoon: ${r.title}`;
      const { data: sent } = await admin
        .from("notifications")
        .select("profile_id")
        .eq("tenant_id", tenantId)
        .eq("ref", runConfirmRef(r.id))
        .eq("title", title);
      const done = new Set(((sent ?? []) as Row[]).map((n) => String(n.profile_id)));
      const fresh = to.filter((id) => !done.has(id));
      if (!fresh.length) continue;
      await notifyUsers({
        tenantId,
        profileIds: fresh,
        category: "approval",
        title,
        body: `${r.moved} moved by the night run. On the Today page: mark anyone who didn't travel as No-show, add anyone missing, then Confirm run — or Postpone it if it didn't go.`,
        url: "/offshore/today",
        module: "offshore",
        ref: runConfirmRef(r.id),
      });
      reminded += fresh.length;
    }
  }
  return { ok: true, reminded };
}
